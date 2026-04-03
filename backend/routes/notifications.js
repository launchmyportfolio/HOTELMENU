const express = require("express");

const Notification = require("../models/Notification");
const CustomerSession = require("../models/CustomerSession");
const Restaurant = require("../models/Restaurant");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const {
  createNotification,
  createNotificationsForRoles,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification
} = require("../services/notificationService");

const router = express.Router();

const { TARGET_ROLES, NOTIFICATION_TYPES, NOTIFICATION_PRIORITIES } = Notification;
const OWNER_ROLES = ["ADMIN", "KITCHEN", "STAFF"];

function normalizeRole(value, fallback = "ADMIN") {
  const role = String(value || fallback).trim().toUpperCase();
  if (!TARGET_ROLES.includes(role)) return fallback;
  return role;
}

function normalizeType(value) {
  if (!value) return "";
  const type = String(value).trim().toUpperCase();
  return NOTIFICATION_TYPES.includes(type) ? type : "";
}

function normalizePriority(value) {
  if (!value) return "";
  const priority = String(value).trim().toUpperCase();
  return NOTIFICATION_PRIORITIES.includes(priority) ? priority : "";
}

function sanitizePagination(req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 200);
  return { page, limit, skip: (page - 1) * limit };
}

async function verifyCustomerAccess(req, res, next) {
  try {
    const restaurantId = req.query.restaurantId || req.body.restaurantId;
    const tableNumber = Number(req.query.tableNumber || req.body.tableNumber);
    const sessionId = req.query.sessionId || req.body.sessionId;

    if (!restaurantId || !tableNumber || !sessionId) {
      return res.status(400).json({ error: "restaurantId, tableNumber, and sessionId are required" });
    }

    const activeSession = await CustomerSession.findOne({
      restaurantId,
      tableNumber,
      sessionId
    });

    if (!activeSession) {
      return res.status(401).json({ error: "Invalid customer session" });
    }

    req.customerNotificationAccess = {
      restaurantId,
      tableNumber,
      sessionId,
      customerName: activeSession.customerName
    };

    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function buildQueryFilters(req) {
  const query = {};

  if (req.query.unread === "true") {
    query.isRead = false;
  }

  const type = normalizeType(req.query.type);
  if (type) {
    query.type = type;
  }

  const priority = normalizePriority(req.query.priority);
  if (priority) {
    query.priority = priority;
  }

  if (req.query.orderId) {
    query.orderId = String(req.query.orderId);
  }

  if (req.query.tableNumber && Number(req.query.tableNumber)) {
    query.tableNumber = Number(req.query.tableNumber);
  }

  return query;
}

function parseRoles(input, fallbackRoles = []) {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
      .split(",")
      .map(part => part.trim())
      .filter(Boolean);

  const unique = [...new Set(raw.map(role => normalizeRole(role)).filter(role => OWNER_ROLES.includes(role)))];
  return unique.length ? unique : fallbackRoles;
}

// Owner/Kitchen/Staff notifications (auth required)
router.get("/owner", verifyOwnerToken, async (req, res) => {
  try {
    const role = normalizeRole(req.query.role, "ADMIN");
    if (!OWNER_ROLES.includes(role)) {
      return res.status(400).json({ error: "Invalid owner role" });
    }

    const { page, limit, skip } = sanitizePagination(req);
    const filters = {
      restaurantId: req.owner.restaurantId,
      targetRole: role,
      ...buildQueryFilters(req)
    };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filters).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filters),
      Notification.countDocuments({
        restaurantId: req.owner.restaurantId,
        targetRole: role,
        isRead: false
      })
    ]);

    return res.json({ notifications, total, unreadCount, page, limit, role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Customer notifications (session based)
router.get("/customer", verifyCustomerAccess, async (req, res) => {
  try {
    const { page, limit, skip } = sanitizePagination(req);
    const filters = {
      restaurantId: req.customerNotificationAccess.restaurantId,
      targetRole: "CUSTOMER",
      tableNumber: req.customerNotificationAccess.tableNumber,
      sessionId: req.customerNotificationAccess.sessionId,
      ...buildQueryFilters(req)
    };

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filters).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filters),
      Notification.countDocuments({
        restaurantId: req.customerNotificationAccess.restaurantId,
        targetRole: "CUSTOMER",
        tableNumber: req.customerNotificationAccess.tableNumber,
        sessionId: req.customerNotificationAccess.sessionId,
        isRead: false
      })
    ]);

    return res.json({ notifications, total, unreadCount, page, limit, role: "CUSTOMER" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/owner/:id/read", verifyOwnerToken, async (req, res) => {
  try {
    const role = normalizeRole(req.body.role, "ADMIN");
    const isRead = req.body.isRead !== false;

    const notification = await markNotificationAsRead(
      req.params.id,
      {
        restaurantId: req.owner.restaurantId,
        targetRole: role
      },
      isRead
    );

    if (!notification) return res.status(404).json({ error: "Notification not found" });
    return res.json(notification);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/customer/:id/read", verifyCustomerAccess, async (req, res) => {
  try {
    const isRead = req.body.isRead !== false;
    const notification = await markNotificationAsRead(
      req.params.id,
      {
        restaurantId: req.customerNotificationAccess.restaurantId,
        targetRole: "CUSTOMER",
        tableNumber: req.customerNotificationAccess.tableNumber,
        sessionId: req.customerNotificationAccess.sessionId
      },
      isRead
    );

    if (!notification) return res.status(404).json({ error: "Notification not found" });
    return res.json(notification);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/owner/read-all", verifyOwnerToken, async (req, res) => {
  try {
    const role = normalizeRole(req.body.role, "ADMIN");
    const isRead = req.body.isRead !== false;

    const result = await markAllNotificationsAsRead(
      {
        restaurantId: req.owner.restaurantId,
        targetRole: role
      },
      isRead
    );

    return res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/customer/read-all", verifyCustomerAccess, async (req, res) => {
  try {
    const isRead = req.body.isRead !== false;
    const result = await markAllNotificationsAsRead(
      {
        restaurantId: req.customerNotificationAccess.restaurantId,
        targetRole: "CUSTOMER",
        tableNumber: req.customerNotificationAccess.tableNumber,
        sessionId: req.customerNotificationAccess.sessionId
      },
      isRead
    );

    return res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete("/owner/:id", verifyOwnerToken, async (req, res) => {
  try {
    const role = req.query.role ? normalizeRole(req.query.role, "ADMIN") : undefined;

    const filters = { restaurantId: req.owner.restaurantId };
    if (role) filters.targetRole = role;

    const removed = await deleteNotification(req.params.id, filters);
    if (!removed) return res.status(404).json({ error: "Notification not found" });

    return res.json({ message: "Notification deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/owner/preferences/sound", verifyOwnerToken, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.owner.restaurantId).select("notificationSoundEnabled").lean();
    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    return res.json({ soundEnabled: restaurant.notificationSoundEnabled !== false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/owner/preferences/sound", verifyOwnerToken, async (req, res) => {
  try {
    const soundEnabled = req.body?.soundEnabled !== false;
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.owner.restaurantId,
      { notificationSoundEnabled: soundEnabled },
      { new: true, select: "notificationSoundEnabled" }
    ).lean();

    if (!restaurant) return res.status(404).json({ error: "Restaurant not found" });
    return res.json({ soundEnabled: restaurant.notificationSoundEnabled !== false });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Customer waiter call
router.post("/waiter-call", verifyCustomerAccess, async (req, res) => {
  try {
    const { restaurantId, tableNumber, sessionId, customerName } = req.customerNotificationAccess;
    const note = String(req.body.note || "").trim();

    const payload = {
      title: `Waiter call from Table ${tableNumber}`,
      message: note
        ? `${customerName || "Customer"} requested assistance: ${note}`
        : `${customerName || "Customer"} requested assistance at table ${tableNumber}`,
      type: "WAITER_CALLED",
      priority: "HIGH",
      tableNumber,
      restaurantId,
      metadata: { note, source: "customer-contact" }
    };

    await createNotificationsForRoles(payload, ["STAFF", "ADMIN"]);
    await createNotification({
      ...payload,
      targetRole: "CUSTOMER",
      sessionId,
      priority: "MEDIUM",
      title: "Staff has been notified",
      message: "A waiter has been notified and will assist you shortly.",
      metadata: { acknowledged: true }
    });

    return res.status(201).json({ message: "Staff has been notified." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Owner announcement / system alert
router.post("/owner/announcement", verifyOwnerToken, async (req, res) => {
  try {
    const {
      title,
      message,
      priority = "MEDIUM",
      roles = ["ADMIN", "KITCHEN", "STAFF"],
      tableNumber,
      orderId,
      metadata = {}
    } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: "title and message are required" });
    }

    const targetRoles = parseRoles(roles, ["ADMIN"]);

    const docs = await createNotificationsForRoles(
      {
        title,
        message,
        type: "SYSTEM_ALERT",
        priority,
        restaurantId: req.owner.restaurantId,
        tableNumber,
        orderId,
        metadata
      },
      targetRoles,
      { allowDuplicate: true }
    );

    return res.status(201).json({ created: docs.length, notifications: docs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Owner payment status trigger hook
router.post("/owner/payment", verifyOwnerToken, async (req, res) => {
  try {
    const {
      orderId,
      tableNumber,
      sessionId,
      paymentStatus = "success",
      message,
      amount
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const normalized = String(paymentStatus).trim().toLowerCase();
    const isSuccess = normalized === "success" || normalized === "completed";
    const type = isSuccess ? "PAYMENT_SUCCESS" : "PAYMENT_FAILED";
    const priority = isSuccess ? "MEDIUM" : "CRITICAL";

    const basePayload = {
      title: isSuccess ? "Payment completed" : "Payment issue detected",
      message: message || (isSuccess
        ? `Payment completed for order ${orderId}.`
        : `Payment failed or pending for order ${orderId}.`),
      type,
      priority,
      restaurantId: req.owner.restaurantId,
      tableNumber,
      orderId,
      metadata: {
        paymentStatus: normalized,
        amount: amount || null
      }
    };

    const docs = await createNotificationsForRoles(basePayload, ["ADMIN", "STAFF"]);

    if (sessionId && tableNumber) {
      await createNotification({
        ...basePayload,
        targetRole: "CUSTOMER",
        sessionId,
        priority: isSuccess ? "LOW" : "HIGH"
      });
    }

    return res.status(201).json({ created: docs.length + (sessionId && tableNumber ? 1 : 0) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
