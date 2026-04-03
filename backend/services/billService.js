const crypto = require("crypto");

const Order = require("../models/Order");

const BILL_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  CANCELLED: "CANCELLED"
};

const PAYMENT_STATUS = {
  PENDING: "PENDING",
  INITIATED: "INITIATED",
  SUCCESS: "SUCCESS",
  FAILED: "FAILED"
};

const BILL_ITEM_STATUS = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  SERVED: "Served",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled"
};

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return fallback;
  }
  return number;
}

function normalizePaymentStatus(value, fallback = PAYMENT_STATUS.PENDING) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "PAID") return PAYMENT_STATUS.SUCCESS;
  if (Object.values(PAYMENT_STATUS).includes(normalized)) return normalized;
  return fallback;
}

function normalizeBillItemStatus(value, fallback = BILL_ITEM_STATUS.PENDING) {
  const normalized = String(value || "").trim().toUpperCase();
  switch (normalized) {
    case "PENDING":
    case "ACCEPTED":
      return BILL_ITEM_STATUS.PENDING;
    case "COOKING":
    case "PREPARING":
      return BILL_ITEM_STATUS.PREPARING;
    case "READY":
      return BILL_ITEM_STATUS.READY;
    case "SERVED":
    case "COMPLETED":
      return BILL_ITEM_STATUS.SERVED;
    case "REJECTED":
      return BILL_ITEM_STATUS.REJECTED;
    case "CANCELLED":
      return BILL_ITEM_STATUS.CANCELLED;
    default:
      return fallback;
  }
}

function createBatchId(prefix = "batch") {
  if (crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

function isIgnoredItemStatus(status = "") {
  const normalized = normalizeBillItemStatus(status);
  return normalized === BILL_ITEM_STATUS.REJECTED || normalized === BILL_ITEM_STATUS.CANCELLED;
}

function isServedItemStatus(status = "") {
  return normalizeBillItemStatus(status) === BILL_ITEM_STATUS.SERVED;
}

function isReadyItemStatus(status = "") {
  return normalizeBillItemStatus(status) === BILL_ITEM_STATUS.READY;
}

function isPreparingItemStatus(status = "") {
  return normalizeBillItemStatus(status) === BILL_ITEM_STATUS.PREPARING;
}

function clonePlain(value) {
  return value?.toObject ? value.toObject() : value;
}

function toLegacyItems(billItems = []) {
  return (Array.isArray(billItems) ? billItems : []).map(item => ({
    name: String(item?.name || "").trim(),
    category: String(item?.category || "General").trim() || "General",
    price: Number(item?.price || 0),
    qty: Number(item?.qty || 0),
    status: normalizeBillItemStatus(item?.status),
    billItemId: String(item?._id || item?.billItemId || ""),
    orderedAt: item?.orderedAt || null
  }));
}

function deriveBillStatus(order = {}) {
  const billStatus = String(order.billStatus || "").trim().toUpperCase();
  const paymentStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
  if (billStatus === BILL_STATUS.CLOSED && paymentStatus === PAYMENT_STATUS.SUCCESS) {
    return "Completed";
  }

  const billItems = Array.isArray(order.billItems) && order.billItems.length
    ? order.billItems
    : Array.isArray(order.items)
      ? order.items
      : [];

  const activeItems = billItems.filter(item => !isIgnoredItemStatus(item?.status));

  if (!activeItems.length) {
    return "Rejected";
  }

  if (activeItems.every(item => isServedItemStatus(item?.status))) {
    return paymentStatus === PAYMENT_STATUS.SUCCESS ? "Completed" : "Served";
  }

  if (activeItems.some(item => isReadyItemStatus(item?.status))) {
    return "Ready";
  }

  if (activeItems.some(item => isPreparingItemStatus(item?.status))) {
    return "Preparing";
  }

  return "Pending";
}

function syncLegacyItems(order) {
  const billItems = Array.isArray(order.billItems) ? order.billItems : [];
  order.items = toLegacyItems(billItems);
  order.total = Number(computeBillSubtotal(order).toFixed(2));
  if (!Number.isFinite(Number(order.payableTotal))) {
    order.payableTotal = order.total;
  }
  order.status = deriveBillStatus(order);
  order.lastOrderedAt = order.lastOrderedAt || order.createdAt || new Date();
  return order;
}

function computeBillSubtotal(order = {}) {
  const items = Array.isArray(order.billItems) ? order.billItems : [];
  return items.reduce((sum, item) => {
    if (isIgnoredItemStatus(item?.status)) return sum;
    return sum + toPositiveNumber(item?.lineTotal, toPositiveNumber(item?.price, 0) * Math.max(1, Number(item?.qty || 1)));
  }, 0);
}

function buildBillItems(items = [], options = {}) {
  const now = options.now || new Date();
  const batchId = String(options.batchId || createBatchId()).trim();

  return (Array.isArray(items) ? items : []).map(item => {
    const qty = Math.max(1, Number(item?.qty || 1));
    const price = toPositiveNumber(item?.price, 0);
    return {
      name: String(item?.name || "").trim(),
      category: String(item?.category || "General").trim() || "General",
      price,
      qty,
      lineTotal: Number((price * qty).toFixed(2)),
      status: normalizeBillItemStatus(item?.status, BILL_ITEM_STATUS.PENDING),
      batchId,
      orderedAt: now
    };
  }).filter(item => item.name);
}

function ensureBillItems(order) {
  const doc = order;
  if (!Array.isArray(doc.billItems) || !doc.billItems.length) {
    const legacyItems = Array.isArray(doc.items) ? doc.items : [];
    if (legacyItems.length) {
      doc.billItems = buildBillItems(
        legacyItems.map(item => ({
          name: item.name,
          category: item.category || "General",
          price: item.price,
          qty: item.qty,
          status: item.status || doc.status || BILL_ITEM_STATUS.PENDING
        })),
        {
          now: doc.createdAt || new Date(),
          batchId: createBatchId("legacy")
        }
      );
    } else {
      doc.billItems = [];
    }
  }

  if (!doc.billStatus) {
    doc.billStatus = normalizePaymentStatus(doc.paymentStatus) === PAYMENT_STATUS.SUCCESS
      ? BILL_STATUS.CLOSED
      : BILL_STATUS.OPEN;
  }

  return syncLegacyItems(doc);
}

function appendItemsToBill(order, items = [], context = {}) {
  const doc = ensureBillItems(order);
  const now = context.now || new Date();
  const billItems = buildBillItems(items, {
    now,
    batchId: context.batchId || createBatchId()
  });

  doc.billItems.push(...billItems);
  doc.customerName = String(context.customerName || doc.customerName || "").trim();
  doc.phoneNumber = String(context.phoneNumber || doc.phoneNumber || "").trim();
  doc.sessionId = String(context.sessionId || doc.sessionId || "").trim();
  doc.lastOrderedAt = now;
  doc.billStatus = BILL_STATUS.OPEN;
  doc.billClosedAt = null;

  if (normalizePaymentStatus(doc.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
    doc.paymentStatus = PAYMENT_STATUS.PENDING;
    doc.paymentAttemptId = "";
    doc.transactionId = "";
    doc.paymentRequestedAt = null;
    doc.paymentMethodId = "";
    doc.paymentMethod = "";
    doc.paymentProvider = "";
    doc.paymentType = "OFFLINE";
    doc.paymentInstructions = "";
    doc.convenienceFee = 0;
    doc.payableTotal = 0;
    doc.paidAt = null;
  }

  return syncLegacyItems(doc);
}

function markBillItems(order, billItemIds = [], nextStatus, options = {}) {
  const doc = ensureBillItems(order);
  const normalizedStatus = normalizeBillItemStatus(nextStatus, BILL_ITEM_STATUS.PENDING);
  const targetIds = new Set((Array.isArray(billItemIds) ? billItemIds : [billItemIds]).map(value => String(value || "")).filter(Boolean));
  const applyToAll = !targetIds.size;
  const now = options.now || new Date();

  doc.billItems.forEach(item => {
    const itemId = String(item?._id || "");
    if (!applyToAll && !targetIds.has(itemId)) {
      return;
    }

    if (isIgnoredItemStatus(item?.status) && normalizedStatus !== BILL_ITEM_STATUS.CANCELLED && normalizedStatus !== BILL_ITEM_STATUS.REJECTED) {
      return;
    }

    item.status = normalizedStatus;
    if (normalizedStatus === BILL_ITEM_STATUS.PREPARING) {
      item.preparedAt = now;
    }
    if (normalizedStatus === BILL_ITEM_STATUS.READY) {
      item.readyAt = now;
    }
    if (normalizedStatus === BILL_ITEM_STATUS.SERVED) {
      item.servedAt = now;
    }
  });

  return syncLegacyItems(doc);
}

function upsertPaymentTransaction(order, partial = {}) {
  const doc = ensureBillItems(order);
  const attemptId = String(partial.attemptId || "").trim();
  const gatewayPaymentId = String(partial.gatewayPaymentId || "").trim();
  const gatewayOrderId = String(partial.gatewayOrderId || "").trim();

  const existing = (doc.paymentTransactions || []).find(item => {
    if (attemptId && String(item.attemptId || "") === attemptId) return true;
    if (gatewayPaymentId && String(item.gatewayPaymentId || "") === gatewayPaymentId) return true;
    if (gatewayOrderId && String(item.gatewayOrderId || "") === gatewayOrderId && !gatewayPaymentId) return true;
    return false;
  });

  const nextPayload = {
    attemptId,
    provider: String(partial.provider || existing?.provider || "").trim(),
    paymentMethodId: String(partial.paymentMethodId || existing?.paymentMethodId || "").trim(),
    paymentMethod: String(partial.paymentMethod || existing?.paymentMethod || "").trim(),
    gatewayOrderId,
    gatewayPaymentId,
    signature: String(partial.signature || existing?.signature || "").trim(),
    amount: toPositiveNumber(partial.amount, toPositiveNumber(existing?.amount, 0)),
    currency: String(partial.currency || existing?.currency || "INR").trim() || "INR",
    status: normalizePaymentStatus(partial.status, normalizePaymentStatus(existing?.status, PAYMENT_STATUS.PENDING)),
    verifiedAt: partial.verifiedAt || existing?.verifiedAt || null,
    failureReason: String(partial.failureReason || existing?.failureReason || "").trim(),
    gatewayResponse: partial.gatewayResponse && typeof partial.gatewayResponse === "object"
      ? { ...(clonePlain(existing?.gatewayResponse) || {}), ...partial.gatewayResponse }
      : (clonePlain(existing?.gatewayResponse) || {})
  };

  if (existing) {
    Object.assign(existing, nextPayload);
  } else {
    doc.paymentTransactions.push(nextPayload);
  }

  return doc;
}

function buildOrderResponse(order) {
  const plain = order?.toObject ? order.toObject() : { ...(order || {}) };
  const withBillItems = ensureBillItems(plain);
  return {
    ...withBillItems,
    items: toLegacyItems(withBillItems.billItems || []),
    billItems: toLegacyItems(withBillItems.billItems || []),
    activeBill: String(withBillItems.billStatus || "").toUpperCase() === BILL_STATUS.OPEN
  };
}

async function findActiveBill(restaurantId, tableNumber, sessionId = "") {
  const query = {
    restaurantId: String(restaurantId || "").trim(),
    tableNumber: Number(tableNumber),
    billStatus: BILL_STATUS.OPEN
  };

  const normalizedSessionId = String(sessionId || "").trim();
  if (normalizedSessionId) {
    query.sessionId = normalizedSessionId;
  }

  return Order.findOne(query).sort({ createdAt: -1 });
}

function closeBill(order, options = {}) {
  const doc = ensureBillItems(order);
  const now = options.now || new Date();
  doc.billStatus = BILL_STATUS.CLOSED;
  doc.billClosedAt = now;
  doc.paidAt = doc.paidAt || now;
  doc.status = "Completed";
  return syncLegacyItems(doc);
}

function isBillServed(order = {}) {
  return deriveBillStatus(order) === "Served" || deriveBillStatus(order) === "Completed";
}

module.exports = {
  BILL_STATUS,
  PAYMENT_STATUS,
  BILL_ITEM_STATUS,
  normalizePaymentStatus,
  normalizeBillItemStatus,
  ensureBillItems,
  appendItemsToBill,
  markBillItems,
  computeBillSubtotal,
  buildOrderResponse,
  upsertPaymentTransaction,
  findActiveBill,
  closeBill,
  deriveBillStatus,
  isBillServed,
  createBatchId
};
