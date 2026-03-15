const express = require("express");
const crypto = require("crypto");

const CustomerSession = require("../models/CustomerSession");

const router = express.Router();

// Start a new session for a table
router.post("/start", async (req, res) => {

  try {

    const { tableNumber, customerName, phoneNumber } = req.body;

    if (!tableNumber || !customerName || !phoneNumber) {
      return res.status(400).json({ error: "Table number, name, and phone are required." });
    }

    const numericTable = Number(tableNumber);

    const existing = await CustomerSession.findOne({ tableNumber: numericTable, active: true });
    if (existing) {
      return res.status(409).json({ error: `Table ${numericTable} is currently occupied.` });
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

    const session = new CustomerSession({
      tableNumber: numericTable,
      customerName,
      phoneNumber,
      sessionId
    });

    await session.save();

    return res.json(session);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});


// End an active session
router.post("/end", async (req, res) => {

  try {

    const { tableNumber, sessionId } = req.body;

    if (!tableNumber || !sessionId) {
      return res.status(400).json({ error: "Table number and sessionId are required." });
    }

    const numericTable = Number(tableNumber);

    const session = await CustomerSession.findOneAndUpdate(
      { tableNumber: numericTable, sessionId, active: true },
      { active: false, endedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Active session not found." });
    }

    return res.json({ message: "Session ended", session });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});


// Check if a table has an active session
router.get("/:tableNumber", async (req, res) => {

  try {

    const numericTable = Number(req.params.tableNumber);

    const session = await CustomerSession.findOne({ tableNumber: numericTable, active: true });

    if (!session) {
      return res.json({ active: false });
    }

    return res.json({ active: true, session });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});

module.exports = router;
