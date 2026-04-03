const Notification = require("../models/Notification");
const { emitNotification } = require("../socketEmitter");

const ORDER_STATUS_MAP = {
  PENDING: "ORDER_ACCEPTED",
  ACCEPTED: "ORDER_ACCEPTED",
  COOKING: "ORDER_PREPARING",
  PREPARING: "ORDER_PREPARING",
  READY: "ORDER_READY",
  SERVED: "ORDER_SERVED",
  COMPLETED: "PAYMENT_SUCCESS",
  REJECTED: "ORDER_REJECTED"
};

const DEFAULT_RESTAURANT = process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";

function sanitizeRole(role) {
  return String(role || "").trim().toUpperCase();
}

function sanitizeType(type) {
  return String(type || "SYSTEM_ALERT").trim().toUpperCase();
}

function sanitizePriority(priority) {
  return String(priority || "").trim().toUpperCase();
}

function normalizeOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return num;
}

function encodePathPart(value) {
  return encodeURIComponent(String(value));
}

function buildPath(path, query = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function getDefaultPriority(type) {
  switch (sanitizeType(type)) {
    case "NEW_ORDER":
    case "ORDER_READY":
    case "TABLE_OCCUPIED":
    case "WAITER_CALLED":
      return "HIGH";
    case "PAYMENT_FAILED":
      return "CRITICAL";
    case "ORDER_REJECTED":
      return "HIGH";
    case "TABLE_AVAILABLE":
    case "ORDER_ACCEPTED":
    case "ORDER_PREPARING":
    case "ORDER_SERVED":
    case "PAYMENT_SUCCESS":
      return "MEDIUM";
    default:
      return "LOW";
  }
}

function shouldEnableSound({ soundEnabled, priority, type }) {
  if (typeof soundEnabled === "boolean") return soundEnabled;
  const resolvedPriority = sanitizePriority(priority) || getDefaultPriority(type);
  return resolvedPriority === "HIGH" || resolvedPriority === "CRITICAL";
}

function mapOrderStatusToNotificationType(status) {
  const key = String(status || "").trim().toUpperCase();
  return ORDER_STATUS_MAP[key] || "SYSTEM_ALERT";
}

function buildUniqueKey(payload = {}) {
  const explicit = String(payload.uniqueKey || "").trim();
  if (explicit) return explicit;

  const type = sanitizeType(payload.type);
  const orderId = payload.orderId ? String(payload.orderId).trim() : "";
  const tableId = payload.tableId ? String(payload.tableId).trim() : "";
  const bookingId = payload.bookingId ? String(payload.bookingId).trim() : "";
  const tableNumber = normalizeOptionalNumber(payload.tableNumber);

  if (type.startsWith("PAYMENT_") && orderId) {
    return `PAYMENT_${orderId}`;
  }

  if ((type.startsWith("BOOKING_") || type.includes("BOOKING")) && bookingId) {
    return `BOOKING_${bookingId}`;
  }

  if ((type === "NEW_ORDER" || type.startsWith("ORDER_")) && orderId) {
    return `ORDER_${orderId}`;
  }

  if (type.startsWith("TABLE_")) {
    if (tableId) return `TABLE_${tableId}`;
    if (tableNumber !== undefined) return `TABLE_${tableNumber}`;
  }

  if (type === "WAITER_CALLED") {
    if (tableId) return `WAITER_${tableId}`;
    if (tableNumber !== undefined) return `WAITER_${tableNumber}`;
  }

  if (bookingId) return `BOOKING_${bookingId}`;
  if (orderId) return `ORDER_${orderId}`;
  if (tableId) return `TABLE_${tableId}`;
  if (tableNumber !== undefined) return `TABLE_${tableNumber}`;

  return "";
}

function buildRedirectUrl(payload = {}) {
  const explicit = String(payload.redirectUrl || "").trim();
  if (explicit) return explicit;

  const type = sanitizeType(payload.type);
  const role = sanitizeRole(payload.targetRole);
  const orderId = payload.orderId ? String(payload.orderId).trim() : "";
  const bookingId = payload.bookingId ? String(payload.bookingId).trim() : "";
  const restaurantId = String(payload.restaurantId || DEFAULT_RESTAURANT).trim();
  const tableNumber = normalizeOptionalNumber(payload.tableNumber);

  const ownerOrdersUrl = buildPath("/owner/orders", {
    highlightOrder: orderId || undefined
  });
  const ownerTablesUrl = buildPath("/owner/tables", {
    highlightTable: tableNumber !== undefined ? tableNumber : undefined
  });
  const ownerBookingsUrl = buildPath("/notifications", {
    type: "BOOKING",
    bookingId: bookingId || undefined
  });
  const customerStatusUrl = restaurantId && tableNumber !== undefined
    ? buildPath(`/restaurant/${encodePathPart(restaurantId)}/status`, {
      table: tableNumber,
      orderId: orderId || undefined
    })
    : "/notifications";
  const customerHomeUrl = restaurantId && tableNumber !== undefined
    ? buildPath(`/restaurant/${encodePathPart(restaurantId)}`, { table: tableNumber })
    : "/notifications";

  const isOrderType = type === "NEW_ORDER" || type.startsWith("ORDER_");
  const isPaymentType = type.startsWith("PAYMENT_");
  const isTableType = type.startsWith("TABLE_") || type === "WAITER_CALLED";
  const isBookingType = type.startsWith("BOOKING_") || type.includes("BOOKING");

  if (role === "CUSTOMER") {
    if (isOrderType || isPaymentType) return customerStatusUrl;
    if (isTableType) return customerHomeUrl;
    if (isBookingType) return ownerBookingsUrl;
    return "/notifications";
  }

  if (isOrderType || isPaymentType) return ownerOrdersUrl;
  if (isTableType) return ownerTablesUrl;
  if (isBookingType) return ownerBookingsUrl;
  return "/notifications";
}

async function findDuplicate(payload, duplicateWindowMs = 4000) {
  const query = {
    restaurantId: payload.restaurantId,
    targetRole: payload.targetRole,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    createdAt: { $gte: new Date(Date.now() - duplicateWindowMs) }
  };

  if (payload.orderId) {
    query.orderId = String(payload.orderId);
  }

  if (payload.tableNumber !== undefined && payload.tableNumber !== null) {
    query.tableNumber = Number(payload.tableNumber);
  }

  if (payload.bookingId) {
    query.bookingId = String(payload.bookingId);
  }

  if (payload.sessionId) {
    query.sessionId = String(payload.sessionId);
  }

  return Notification.findOne(query).sort({ updatedAt: -1 });
}

function normalizePayload(payload = {}) {
  const normalized = {
    title: String(payload.title || "").trim(),
    message: String(payload.message || "").trim(),
    type: sanitizeType(payload.type),
    priority: sanitizePriority(payload.priority) || getDefaultPriority(payload.type),
    targetRole: sanitizeRole(payload.targetRole),
    tableNumber: normalizeOptionalNumber(payload.tableNumber),
    tableId: payload.tableId ? String(payload.tableId) : undefined,
    orderId: payload.orderId ? String(payload.orderId) : undefined,
    bookingId: payload.bookingId ? String(payload.bookingId) : undefined,
    sessionId: payload.sessionId ? String(payload.sessionId) : undefined,
    restaurantId: String(payload.restaurantId || DEFAULT_RESTAURANT),
    isRead: payload.isRead === true,
    readAt: payload.isRead === true ? new Date() : null,
    soundEnabled: shouldEnableSound(payload),
    uniqueKey: "",
    redirectUrl: "",
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}
  };

  normalized.uniqueKey = buildUniqueKey({ ...payload, ...normalized });
  normalized.redirectUrl = buildRedirectUrl({ ...payload, ...normalized });

  if (!normalized.title) {
    throw new Error("Notification title is required");
  }

  if (!normalized.message) {
    throw new Error("Notification message is required");
  }

  if (!normalized.targetRole) {
    throw new Error("Notification targetRole is required");
  }

  return normalized;
}

async function createNotification(payload, options = {}) {
  const normalized = normalizePayload(payload);

  let notification = null;

  if (!options.allowDuplicate && normalized.uniqueKey) {
    const existing = await Notification.findOne({
      restaurantId: normalized.restaurantId,
      targetRole: normalized.targetRole,
      uniqueKey: normalized.uniqueKey
    });

    if (existing) {
      existing.title = normalized.title;
      existing.message = normalized.message;
      existing.type = normalized.type;
      existing.priority = normalized.priority;
      existing.tableNumber = normalized.tableNumber;
      existing.tableId = normalized.tableId;
      existing.orderId = normalized.orderId;
      existing.bookingId = normalized.bookingId;
      existing.sessionId = normalized.sessionId;
      existing.uniqueKey = normalized.uniqueKey;
      existing.redirectUrl = normalized.redirectUrl;
      existing.soundEnabled = normalized.soundEnabled;
      existing.metadata = normalized.metadata;
      existing.isRead = false;
      existing.readAt = null;
      notification = await existing.save();
    } else {
      notification = await Notification.create(normalized);
    }
  } else {
    const duplicate = options.allowDuplicate
      ? null
      : await findDuplicate(normalized, Number(options.duplicateWindowMs || 4000));

    if (duplicate) {
      return duplicate;
    }

    notification = await Notification.create(normalized);
  }

  if (options.broadcast !== false) {
    emitNotification(notification.toObject());
  }

  return notification;
}

async function createNotificationsForRoles(basePayload, targetRoles = [], options = {}) {
  const uniqueRoles = [...new Set((targetRoles || []).map(sanitizeRole).filter(Boolean))];

  if (!uniqueRoles.length) {
    return [];
  }

  const docs = await Promise.all(uniqueRoles.map(role => {
    return createNotification(
      {
        ...basePayload,
        targetRole: role
      },
      options
    );
  }));

  return docs;
}

async function markNotificationAsRead(notificationId, filter = {}, isRead = true) {
  const update = isRead
    ? { isRead: true, readAt: new Date() }
    : { isRead: false, readAt: null };

  return Notification.findOneAndUpdate(
    {
      _id: notificationId,
      ...filter
    },
    update,
    { new: true }
  );
}

async function markAllNotificationsAsRead(filter = {}, isRead = true) {
  const update = isRead
    ? { isRead: true, readAt: new Date() }
    : { isRead: false, readAt: null };

  return Notification.updateMany(filter, { $set: update });
}

async function deleteNotification(notificationId, filter = {}) {
  return Notification.findOneAndDelete({ _id: notificationId, ...filter });
}

async function cleanupOldNotifications(days = 45) {
  const cutoff = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
  return Notification.deleteMany({ createdAt: { $lt: cutoff } });
}

module.exports = {
  createNotification,
  createNotificationsForRoles,
  mapOrderStatusToNotificationType,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  cleanupOldNotifications,
  getDefaultPriority,
  buildUniqueKey,
  buildRedirectUrl
};
