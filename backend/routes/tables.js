const express = require("express");
const Table = require("../models/Table");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");

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
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary
router.get("/summary", verifyOwnerToken, async (req, res) => {
  try {
    const { restaurantId } = req.owner;
    await ensureTables(restaurantId);
    const total = await Table.countDocuments({ restaurantId });
    const occupied = await Table.countDocuments({ restaurantId, status: "occupied" });
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
    const table = await Table.findOneAndUpdate(
      { restaurantId: req.owner.restaurantId, tableNumber },
      {
        status: "free",
        activeSession: false,
        customerName: "",
        phoneNumber: "",
        updatedAt: new Date()
      },
      { new: true }
    );
    if (!table) return res.status(404).json({ error: "Table not found" });
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

    res.json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
