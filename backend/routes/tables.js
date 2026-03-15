const express = require("express");
const Table = require("../models/Table");
const isAdmin = require("../middleware/isAdmin");

const router = express.Router();

const DEFAULT_TABLES = Number(process.env.DEFAULT_TABLES || 10);

async function ensureTables(minCount = DEFAULT_TABLES) {
  const existing = await Table.countDocuments();
  if (existing >= minCount) return;
  const existingNumbers = new Set((await Table.find({}, "tableNumber")).map(t => t.tableNumber));
  const toCreate = [];
  for (let i = 1; i <= minCount; i += 1) {
    if (!existingNumbers.has(i)) {
      toCreate.push({ tableNumber: i });
    }
  }
  if (toCreate.length) {
    await Table.insertMany(toCreate);
  }
}

// List tables
router.get("/", isAdmin, async (_req, res) => {
  try {
    await ensureTables();
    const tables = await Table.find().sort({ tableNumber: 1 });
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Summary
router.get("/summary", isAdmin, async (_req, res) => {
  try {
    await ensureTables();
    const total = await Table.countDocuments();
    const occupied = await Table.countDocuments({ status: "occupied" });
    const free = total - occupied;
    res.json({ total, occupied, free });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Configure total tables
router.post("/config", isAdmin, async (req, res) => {
  try {
    const { totalTables } = req.body;
    const total = Number(totalTables);
    if (!total || total < 1) {
      return res.status(400).json({ error: "totalTables must be a positive number" });
    }

    await ensureTables(total);

    // If reducing, ensure no occupied tables above the new total
    const occupiedAbove = await Table.find({ tableNumber: { $gt: total }, status: "occupied" });
    if (occupiedAbove.length) {
      return res.status(400).json({ error: "Cannot reduce tables while higher-numbered tables are occupied." });
    }

    await Table.deleteMany({ tableNumber: { $gt: total } });

    const tables = await Table.find().sort({ tableNumber: 1 });
    res.json({ message: "Table configuration updated", tables });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Force free a table
router.post("/:tableNumber/free", isAdmin, async (req, res) => {
  try {
    const tableNumber = Number(req.params.tableNumber);
    const table = await Table.findOneAndUpdate(
      { tableNumber },
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
router.post("/sync/session", async (req, res) => {
  try {
    const { tableNumber, status, customerName = "", phoneNumber = "" } = req.body;
    if (!tableNumber || !status) {
      return res.status(400).json({ error: "tableNumber and status are required" });
    }

    await ensureTables(tableNumber);

    const table = await Table.findOneAndUpdate(
      { tableNumber: Number(tableNumber) },
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
