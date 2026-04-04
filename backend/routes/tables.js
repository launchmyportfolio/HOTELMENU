const express = require("express");
const CustomerSession = require("../models/CustomerSession");
const Order = require("../models/Order");
const Table = require("../models/Table");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const { createNotificationsForRoles } = require("../services/notificationService");
const { BILL_STATUS, PAYMENT_STATUS, closeBill, isBillServed } = require("../services/billService");
const { getTableOccupancySnapshot } = require("../services/tableOccupancyService");

const router = express.Router();

const DEFAULT_TABLES = Number(process.env.DEFAULT_TABLES || 10);
const DEFAULT_RESTAURANT = process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";
let indexesFixed = false;

async function ensureIndexes() {
  if (indexesFixed) return;
  try {
    // remove legacy unique index on tableNumber
    await Table.collection.dropIndex("tableNumber_1").catch(() => {});
    await Table.collection.createIndex({ restaurantId: 1, tableNumber: 1 }, { unique: true });
    indexesFixed = true;
  } catch (_err) {
    // ignore, will retry on next call
  }
}

async function normalizeExistingTables() {
  await Table.updateMany(
    { $or: [{ restaurantId: { $exists: false } }, { restaurantId: null }] },
    { $set: { restaurantId: DEFAULT_RESTAURANT } }
  );
}

async function ensureTables(restaurantId, minCount = DEFAULT_TABLES) {
  await ensureIndexes();
  await normalizeExistingTables();
  const existing = await Table.countDocuments({ restaurantId });
  if (existing >= minCount) return;
  const existingNumbers = new Set((await Table.find({ restaurantId }, "tableNumber")).map(t => t.tableNumber));
  const toCreate = [];
  for (let i = 1; i <= minCount; i += 1) {
    if (!existingNumbers.has(i)) {
      toCreate.push({ tableNumber: i, restaurantId });
    }
  }
  if (toCreate.length) {
    await Table.insertMany(toCreate);
  }
}

// List tables
router.get("/", verifyOwnerToken, async (req, res) => {
  try {
    const { restaurantId } = req.owner;
    await ensureTables(restaurantId);
    const tables = await Table.find({ restaurantId }).sort({ tableNumber: 1 });
    const snapshots = await Promise.all(
      tables.map(table => getTableOccupancySnapshot(restaurantId, table.tableNumber, { table }))
    );

    res.json(snapshots.map(snapshot => {
      const safeTable = snapshot.table?.toObject ? snapshot.table.toObject() : (snapshot.table || {});
      return {
        ...safeTable,
        tableNumber: Number(snapshot.table?.tableNumber || safeTable.tableNumber),
        status: snapshot.tableStatus,
        activeSession: snapshot.active,
        activeBill: snapshot.activeBill,
        activeBillId: snapshot.billId || ""
      };
    }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary
router.get("/summary", verifyOwnerToken, async (req, res) => {
  try {
    const { restaurantId } = req.owner;
    await ensureTables(restaurantId);
    const tables = await Table.find({ restaurantId }).sort({ tableNumber: 1 });
    const snapshots = await Promise.all(
      tables.map(table => getTableOccupancySnapshot(restaurantId, table.tableNumber, { table }))
    );
    const total = snapshots.length;
    const occupied = snapshots.filter(snapshot => snapshot.occupied).length;
    const free = total - occupied;
    res.json({ total, occupied, free });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configure total tables
router.post("/config", verifyOwnerToken, async (req, res) => {
  try {
    const { totalTables } = req.body;
    const total = Number(totalTables);
    if (!total || total < 1) {
      return res.status(400).json({ error: "totalTables must be a positive number" });
    }

    await ensureTables(req.owner.restaurantId, total);

    // If reducing, ensure no occupied tables above the new total
    const occupiedAbove = await Table.find({
      restaurantId: req.owner.restaurantId,
      tableNumber: { $gt: total },
      status: "occupied"
    });
    if (occupiedAbove.length) {
      return res.status(400).json({ error: "Cannot reduce tables while higher-numbered tables are occupied." });
    }

    await Table.deleteMany({ restaurantId: req.owner.restaurantId, tableNumber: { $gt: total } });

    const tables = await Table.find({ restaurantId: req.owner.restaurantId }).sort({ tableNumber: 1 });
    res.json({ message: "Table configuration updated", tables });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force free a table
router.post("/:tableNumber/free", verifyOwnerToken, async (req, res) => {
  try {
    const tableNumber = Number(req.params.tableNumber);
    const restaurantId = req.owner.restaurantId;
    const now = new Date();

    const [table, openBills] = await Promise.all([
      Table.findOneAndUpdate(
        { restaurantId, tableNumber },
        {
          status: "free",
          activeSession: false,
          customerName: "",
          phoneNumber: "",
          updatedAt: now
        },
        { new: true }
      ),
      Order.find({
        restaurantId,
        tableNumber,
        billStatus: BILL_STATUS.OPEN
      }).sort({ createdAt: -1 })
    ]);
    if (!table) return res.status(404).json({ error: "Table not found" });

    await CustomerSession.updateMany(
      { restaurantId, tableNumber, active: true },
      {
        $set: {
          active: false,
          endedAt: now,
          lastActivityAt: now
        }
      }
    );

    for (const bill of openBills) {
      if (String(bill.paymentStatus || "").toUpperCase() === PAYMENT_STATUS.SUCCESS && isBillServed(bill)) {
        closeBill(bill, { now });
      } else {
        bill.billStatus = BILL_STATUS.CANCELLED;
        bill.billClosedAt = now;
        bill.status = "Rejected";
      }
      await bill.save();
    }

    await createNotificationsForRoles(
      {
        title: `Table ${tableNumber} marked free`,
        message: `Table ${tableNumber} was manually freed by owner/staff and active sessions were closed.`,
        type: "TABLE_AVAILABLE",
        priority: "MEDIUM",
        tableNumber,
        restaurantId,
        metadata: {
          source: "manual-force-free",
          clearedBillCount: openBills.length
        }
      },
      ["ADMIN", "STAFF"]
    );

    res.json({ message: "Table freed", table });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to update a table when session changes
router.post("/sync/session", verifyOwnerToken, async (req, res) => {
  try {
    const { tableNumber, status, customerName = "", phoneNumber = "" } = req.body;
    if (!tableNumber || !status) {
      return res.status(400).json({ error: "tableNumber and status are required" });
    }

    await ensureTables(req.owner.restaurantId, tableNumber);

    const previous = await Table.findOne({
      restaurantId: req.owner.restaurantId,
      tableNumber: Number(tableNumber)
    });

    const table = await Table.findOneAndUpdate(
      { restaurantId: req.owner.restaurantId, tableNumber: Number(tableNumber) },
      {
        status,
        customerName,
        phoneNumber,
        activeSession: status === "occupied",
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );

    const normalizedStatus = String(status || "").toLowerCase();
    const prevStatus = previous?.status || "free";
    if (normalizedStatus === "occupied" && prevStatus !== "occupied") {
      await createNotificationsForRoles(
        {
          title: `Table ${tableNumber} occupied`,
          message: `Table ${tableNumber} is now occupied.`,
          type: "TABLE_OCCUPIED",
          priority: "MEDIUM",
          tableNumber: Number(tableNumber),
          restaurantId: req.owner.restaurantId,
          metadata: { customerName, phoneNumber, source: "session-sync" }
        },
        ["ADMIN", "STAFF"]
      );
    }

    if (normalizedStatus === "free" && prevStatus !== "free") {
      await createNotificationsForRoles(
        {
          title: `Table ${tableNumber} available`,
          message: `Table ${tableNumber} is now free.`,
          type: "TABLE_AVAILABLE",
          priority: "MEDIUM",
          tableNumber: Number(tableNumber),
          restaurantId: req.owner.restaurantId,
          metadata: { source: "session-sync" }
        },
        ["ADMIN", "STAFF"]
      );
    }

    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
