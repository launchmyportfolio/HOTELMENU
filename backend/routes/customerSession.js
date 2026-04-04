const express = require("express");
const crypto = require("crypto");

const CustomerSession = require("../models/CustomerSession");
const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");
const { createNotificationsForRoles } = require("../services/notificationService");
const {
  getTableOccupancySnapshot,
  touchSessionActivity
} = require("../services/tableOccupancyService");
const {
  syncRestaurantLifecycle,
  buildRestaurantAccessState
} = require("../services/restaurantAccessService");

const router = express.Router();
const DEFAULT_TABLES = Number(process.env.DEFAULT_TABLES || 10);
const DEFAULT_RESTAURANT = process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";
const { sessionLimiter } = require("../middleware/rateLimiters");

async function ensureTables(restaurantId = DEFAULT_RESTAURANT) {
  const count = await Table.countDocuments({ restaurantId });
  if (count === 0) {
    const seed = Array.from({ length: DEFAULT_TABLES }, (_, i) => ({ tableNumber: i + 1, restaurantId }));
    await Table.insertMany(seed);
  }
}

// Start a new session for a table
router.post("/start", sessionLimiter, async (req, res) => {

  try {

    const { tableNumber, customerName, phoneNumber, restaurantId = DEFAULT_RESTAURANT } = req.body;

    if (!tableNumber || !customerName || !phoneNumber) {
      return res.status(400).json({ error: "Table number, name, and phone are required." });
    }

    const numericTable = Number(tableNumber);

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found." });
    }

    await syncRestaurantLifecycle(restaurant);
    const access = buildRestaurantAccessState(restaurant);
    if (!access.publicOrderingEnabled) {
      return res.status(403).json({ error: access.publicMessage });
    }
    if (!access.canAcceptNewOrders) {
      return res.status(403).json({ error: access.orderRestrictionMessage });
    }

    await ensureTables(restaurantId);

    const snapshot = await getTableOccupancySnapshot(restaurantId, numericTable);
    if (!snapshot.tableExists) {
      return res.status(400).json({ error: "Invalid table QR code." });
    }

    if (snapshot.occupied) {
      return res.status(409).json({ error: `Table ${numericTable} is currently occupied.` });
    }

    const sessionId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

    const session = new CustomerSession({
      tableNumber: numericTable,
      customerName,
      phoneNumber,
      sessionId,
      restaurantId,
      lastActivityAt: new Date()
    });

    await session.save();

    await Table.findOneAndUpdate(
      { restaurantId, tableNumber: numericTable },
      {
        tableNumber: numericTable,
        restaurantId,
        status: "occupied",
        customerName,
        phoneNumber,
        activeSession: true,
        updatedAt: new Date()
      },
      { upsert: true }
    );

    await createNotificationsForRoles(
      {
        title: `Table ${numericTable} occupied`,
        message: `${customerName} started a dining session at table ${numericTable}.`,
        type: "TABLE_OCCUPIED",
        priority: "MEDIUM",
        tableNumber: numericTable,
        sessionId,
        restaurantId,
        metadata: {
          customerName,
          phoneNumber
        }
      },
      ["ADMIN", "STAFF"]
    );

    return res.json(session);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});


// End an active session
router.post("/end", sessionLimiter, async (req, res) => {

  try {

    const { tableNumber, sessionId, restaurantId = DEFAULT_RESTAURANT } = req.body;

    if (!tableNumber || !sessionId) {
      return res.status(400).json({ error: "Table number and sessionId are required." });
    }

    const numericTable = Number(tableNumber);

    const session = await CustomerSession.findOneAndUpdate(
      { restaurantId, tableNumber: numericTable, sessionId, active: true },
      { active: false, endedAt: new Date() },
      { new: true }
    );

    if (!session) {
      return res.status(404).json({ error: "Active session not found." });
    }

    const occupancy = await getTableOccupancySnapshot(restaurantId, numericTable);

    await createNotificationsForRoles(
      {
        title: occupancy.occupied ? `Session ended at Table ${numericTable}` : `Table ${numericTable} available`,
        message: occupancy.occupied
          ? `Dining session ended for table ${numericTable}, but the active bill is still open.`
          : `Dining session ended for table ${numericTable}.`,
        type: occupancy.occupied ? "SYSTEM_ALERT" : "TABLE_AVAILABLE",
        priority: "MEDIUM",
        tableNumber: numericTable,
        sessionId,
        restaurantId,
        metadata: {
          customerName: session.customerName
        }
      },
      ["ADMIN", "STAFF"]
    );

    return res.json({
      message: occupancy.occupied
        ? "Session ended. Table remains occupied until the active bill is closed."
        : "Session ended",
      session,
      tableStatus: occupancy.tableStatus,
      activeBill: occupancy.activeBill
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});


// Check if a table has an active session
router.get("/:tableNumber", async (req, res) => {

  try {

    const numericTable = Number(req.params.tableNumber);
    const restaurantId = req.query.restaurantId || DEFAULT_RESTAURANT;

    const requestedSessionId = String(req.query.sessionId || "").trim();
    const snapshot = await getTableOccupancySnapshot(restaurantId, numericTable);

    if (!snapshot.tableExists) {
      return res.json({
        active: false,
        occupied: false,
        activeBill: false,
        tableExists: false,
        tableStatus: "free"
      });
    }

    let activeSession = snapshot.session;
    if (
      requestedSessionId
      && activeSession
      && String(activeSession.sessionId || "") === requestedSessionId
    ) {
      activeSession = await touchSessionActivity({
        restaurantId,
        tableNumber: numericTable,
        sessionId: requestedSessionId
      }) || activeSession;
    }

    return res.json({
      active: Boolean(activeSession),
      occupied: snapshot.occupied,
      activeBill: snapshot.activeBill,
      billId: snapshot.billId,
      session: activeSession || null,
      tableExists: true,
      tableStatus: snapshot.tableStatus
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

});

module.exports = router;
