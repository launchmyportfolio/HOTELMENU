const CustomerSession = require("../models/CustomerSession");
const Order = require("../models/Order");
const Table = require("../models/Table");
const { BILL_STATUS } = require("./billService");

const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;

function toPositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.round(parsed);
}

function getSessionIdleTimeoutMs() {
  const minutes = toPositiveInteger(
    process.env.CUSTOMER_SESSION_IDLE_TIMEOUT_MINUTES,
    DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES
  );
  return minutes * 60 * 1000;
}

function getSessionLastActivity(session = {}) {
  return session.lastActivityAt || session.createdAt || null;
}

function isSessionStale(session = {}, options = {}) {
  if (!session) return false;
  if (options.hasActiveBill) return false;

  const timeoutMs = options.timeoutMs || getSessionIdleTimeoutMs();
  if (!timeoutMs) return false;

  const lastActivityAt = getSessionLastActivity(session);
  if (!lastActivityAt) return false;

  const now = options.now instanceof Date ? options.now : new Date();
  return now.getTime() - new Date(lastActivityAt).getTime() >= timeoutMs;
}

async function touchSessionActivity({ restaurantId, tableNumber, sessionId, now = new Date() }) {
  const safeRestaurantId = String(restaurantId || "").trim();
  const safeSessionId = String(sessionId || "").trim();
  const numericTable = Number(tableNumber);

  if (!safeRestaurantId || !safeSessionId || !Number.isFinite(numericTable) || numericTable <= 0) {
    return null;
  }

  return CustomerSession.findOneAndUpdate(
    {
      restaurantId: safeRestaurantId,
      tableNumber: numericTable,
      sessionId: safeSessionId,
      active: true
    },
    {
      $set: {
        lastActivityAt: now
      }
    },
    {
      new: true
    }
  );
}

async function closeSession(session = null, now = new Date()) {
  if (!session?._id) return null;

  return CustomerSession.findByIdAndUpdate(
    session._id,
    {
      $set: {
        active: false,
        endedAt: now,
        lastActivityAt: now
      }
    },
    {
      new: true
    }
  );
}

function needsTableSync(table = {}, nextState = {}) {
  const nextStatus = nextState.tableStatus === "occupied" ? "occupied" : "free";
  const nextActiveSession = nextState.hasActiveSession === true;
  const nextCustomerName = nextState.customerName || "";
  const nextPhoneNumber = nextState.phoneNumber || "";

  return (
    String(table.status || "free") !== nextStatus
    || Boolean(table.activeSession) !== nextActiveSession
    || String(table.customerName || "") !== nextCustomerName
    || String(table.phoneNumber || "") !== nextPhoneNumber
  );
}

async function syncTableState(table = null, nextState = {}, now = new Date()) {
  if (!table?._id) return table;

  if (!needsTableSync(table, nextState)) {
    return table;
  }

  return Table.findByIdAndUpdate(
    table._id,
    {
      $set: {
        status: nextState.tableStatus === "occupied" ? "occupied" : "free",
        activeSession: nextState.hasActiveSession === true,
        customerName: nextState.customerName || "",
        phoneNumber: nextState.phoneNumber || "",
        updatedAt: now
      }
    },
    { new: true }
  );
}

async function getTableOccupancySnapshot(restaurantId, tableNumber, options = {}) {
  const safeRestaurantId = String(restaurantId || "").trim();
  const numericTable = Number(tableNumber);
  const now = options.now instanceof Date ? options.now : new Date();

  if (!safeRestaurantId || !Number.isFinite(numericTable) || numericTable <= 0) {
    return {
      tableExists: false,
      tableStatus: "free",
      occupied: false,
      active: false,
      activeBill: false,
      session: null,
      bill: null,
      customerName: "",
      phoneNumber: "",
      reason: "INVALID_REQUEST",
      table: null
    };
  }

  const [tableRecord, latestOpenBill, latestSession] = await Promise.all([
    options.table
      ? Promise.resolve(options.table)
      : Table.findOne({ restaurantId: safeRestaurantId, tableNumber: numericTable }),
    Order.findOne({
      restaurantId: safeRestaurantId,
      tableNumber: numericTable,
      billStatus: BILL_STATUS.OPEN
    }).sort({ lastOrderedAt: -1, createdAt: -1 }),
    CustomerSession.findOne({
      restaurantId: safeRestaurantId,
      tableNumber: numericTable,
      active: true
    }).sort({ lastActivityAt: -1, createdAt: -1 })
  ]);

  let activeSession = latestSession;
  if (activeSession && isSessionStale(activeSession, { now, hasActiveBill: Boolean(latestOpenBill) })) {
    await closeSession(activeSession, now);
    activeSession = null;
  }

  const occupiedByBill = Boolean(latestOpenBill);
  const occupiedBySession = Boolean(activeSession);
  const occupied = occupiedByBill || occupiedBySession;
  const customerName = String(
    latestOpenBill?.customerName
    || activeSession?.customerName
    || tableRecord?.customerName
    || ""
  ).trim();
  const phoneNumber = String(
    latestOpenBill?.phoneNumber
    || activeSession?.phoneNumber
    || tableRecord?.phoneNumber
    || ""
  ).trim();

  const nextState = {
    tableStatus: occupied ? "occupied" : "free",
    hasActiveSession: Boolean(activeSession),
    customerName: occupied ? customerName : "",
    phoneNumber: occupied ? phoneNumber : ""
  };

  const syncedTable = await syncTableState(tableRecord, nextState, now);

  return {
    tableExists: Boolean(tableRecord),
    tableStatus: nextState.tableStatus,
    occupied,
    active: Boolean(activeSession),
    activeBill: occupiedByBill,
    session: activeSession,
    bill: latestOpenBill,
    billId: latestOpenBill ? String(latestOpenBill._id) : "",
    customerName: nextState.customerName,
    phoneNumber: nextState.phoneNumber,
    reason: occupiedByBill ? "ACTIVE_BILL" : occupiedBySession ? "ACTIVE_SESSION" : "FREE",
    table: syncedTable || tableRecord
  };
}

module.exports = {
  getSessionIdleTimeoutMs,
  getSessionLastActivity,
  isSessionStale,
  touchSessionActivity,
  closeSession,
  getTableOccupancySnapshot
};
