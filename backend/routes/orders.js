const crypto = require("crypto");
const express = require("express");

const router = express.Router();

const Order = require("../models/Order");
const CustomerSession = require("../models/CustomerSession");
const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const { ordersLimiter } = require("../middleware/rateLimiters");
const { emitNewOrder, emitOrderUpdated } = require("../socketEmitter");
const {
  BILL_STATUS,
  PAYMENT_STATUS,
  ensureBillItems,
  appendItemsToBill,
  markBillItems,
  computeBillSubtotal,
  buildOrderResponse,
  upsertPaymentTransaction,
  findActiveBill,
  closeBill,
  deriveBillStatus,
  normalizeBillItemStatus,
  isBillServed
} = require("../services/billService");
const { createPayment, verifyPayment } = require("../services/payments");
const {
  getOrCreatePaymentSettings,
  getCustomerPaymentOptions,
  resolveMethodForOrder,
  getMethodCredentials,
  normalizeProviderName
} = require("../services/payments/paymentSettingsService");
const {
  createNotification,
  createNotificationsForRoles,
  mapOrderStatusToNotificationType
} = require("../services/notificationService");
const {
  upsertReceiptForOrder,
  buildCustomerReceiptLinks
} = require("../services/receiptService");
const { getTableOccupancySnapshot, touchSessionActivity } = require("../services/tableOccupancyService");
const {
  syncRestaurantLifecycle,
  buildRestaurantAccessState
} = require("../services/restaurantAccessService");

const DEFAULT_RESTAURANT = process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";

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
  if (normalized === PAYMENT_STATUS.PENDING) return PAYMENT_STATUS.PENDING;
  if (normalized === PAYMENT_STATUS.INITIATED) return PAYMENT_STATUS.INITIATED;
  if (normalized === PAYMENT_STATUS.SUCCESS) return PAYMENT_STATUS.SUCCESS;
  if (normalized === PAYMENT_STATUS.FAILED) return PAYMENT_STATUS.FAILED;
  return fallback;
}

function normalizeOrderStatusKey(value) {
  return String(value || "").trim().toUpperCase();
}

function formatOrderStatusForStorage(value, fallback = "Pending") {
  const normalized = normalizeOrderStatusKey(value);
  if (!normalized) return fallback;

  switch (normalized) {
    case "PENDING":
    case "ACCEPTED":
      return "Pending";
    case "COOKING":
      return "Cooking";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "SERVED":
      return "Served";
    case "COMPLETED":
      return "Completed";
    case "REJECTED":
      return "Rejected";
    default:
      return String(value || fallback).trim() || fallback;
  }
}

function isServedOrCompleted(status) {
  const key = normalizeOrderStatusKey(status);
  return key === "SERVED" || key === "COMPLETED";
}

function isOrderCompleted(status) {
  return normalizeOrderStatusKey(status) === "COMPLETED";
}

function isUpiMethod(method = {}) {
  const providerName = normalizeProviderName(method.providerName || method.paymentProvider || "");
  return providerName.includes("UPI")
    || Boolean(String(method.upiId || "").trim())
    || Boolean(String(method.qrImageUrl || "").trim());
}

function createPaymentAttemptId() {
  if (crypto.randomUUID) {
    return `pay_${crypto.randomUUID()}`;
  }
  return `pay_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function normalizePaymentMethodCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function sanitizeProofPayload(proof) {
  if (!proof) return null;

  const rawImage = String(proof.imageUrl || proof.url || "").trim();
  const fileName = String(proof.fileName || proof.name || "").trim();

  if (!rawImage) return null;

  if (rawImage.length > 900000) {
    throw new Error("Payment proof image is too large. Please upload a smaller image.");
  }

  return {
    imageUrl: rawImage,
    fileName,
    uploadedAt: new Date()
  };
}

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];

  return items
    .map(item => {
      const name = String(item?.name || "").trim();
      const category = String(item?.category || "General").trim() || "General";
      const price = toPositiveNumber(item?.price, 0);
      const qty = Math.max(1, Number(item?.qty || 1));
      if (!name) return null;
      return {
        name,
        category,
        price,
        qty
      };
    })
    .filter(Boolean);
}

function sortMethodsWithDefaultFirst(methods = [], defaultMethodId = "") {
  const targetDefault = String(defaultMethodId || "").trim();

  return [...methods]
    .map(method => ({
      ...method,
      isDefault: targetDefault
        ? String(method.methodId || "") === targetDefault
        : method.isDefault === true
    }))
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return String(a.displayName || "").localeCompare(String(b.displayName || ""));
    });
}

async function validateCustomerOrderAccess(order, payload = {}) {
  if (!order) {
    return { ok: false, status: 404, error: "Order not found" };
  }

  const restaurantId = String(payload.restaurantId || "").trim();
  const sessionId = String(payload.sessionId || "").trim();
  const tableNumber = Number(payload.tableNumber);

  if (!restaurantId || !sessionId || !Number.isFinite(tableNumber) || tableNumber <= 0) {
    return {
      ok: false,
      status: 400,
      error: "restaurantId, tableNumber and sessionId are required"
    };
  }

  if (
    String(order.restaurantId || "") !== restaurantId
    || String(order.sessionId || "") !== sessionId
    || Number(order.tableNumber) !== Number(tableNumber)
  ) {
    return {
      ok: false,
      status: 403,
      error: "This order does not belong to this table session"
    };
  }

  const session = await CustomerSession.findOne({
    restaurantId,
    tableNumber: Number(tableNumber),
    sessionId
  });

  if (!session) {
    return {
      ok: false,
      status: 403,
      error: "Invalid customer session"
    };
  }

  if (session?.active) {
    await touchSessionActivity({
      restaurantId,
      tableNumber: Number(tableNumber),
      sessionId
    });
  }

  return {
    ok: true,
    restaurantId,
    tableNumber: Number(tableNumber),
    sessionId,
    session
  };
}

async function releaseTableForOrder(order) {
  await CustomerSession.findOneAndUpdate(
    { restaurantId: order.restaurantId, tableNumber: order.tableNumber, active: true },
    { active: false, endedAt: new Date() }
  );

  await Table.findOneAndUpdate(
    { restaurantId: order.restaurantId, tableNumber: order.tableNumber },
    {
      status: "free",
      customerName: "",
      phoneNumber: "",
      activeSession: false,
      updatedAt: new Date()
    }
  );

  await createNotificationsForRoles(
    {
      title: `Table ${order.tableNumber} is now available`,
      message: `Table ${order.tableNumber} was freed after bill closure.`,
      type: "TABLE_AVAILABLE",
      priority: "MEDIUM",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      restaurantId: order.restaurantId
    },
    ["ADMIN", "STAFF"]
  );
}

async function closeBillIfSettled(order) {
  ensureBillItems(order);
  if (normalizePaymentStatus(order.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
    return false;
  }

  if (!isBillServed(order)) {
    return false;
  }

  closeBill(order);
  await order.save();
  emitOrderUpdated(buildOrderResponse(order));
  await releaseTableForOrder(order);
  return true;
}

async function notifyPaymentSuccess(order, options = {}) {
  const methodLabel = String(order.paymentMethod || order.paymentProvider || "Selected method").trim() || "Selected method";
  const message = options.message
    || `Payment completed for order ${order._id} via ${methodLabel}.`;
  const receiptLinks = buildCustomerReceiptLinks(order, options.receipt || {
    _id: order.receiptId,
    receiptNumber: order.receiptNumber,
    shareToken: order.receiptShareToken
  });

  await createNotificationsForRoles(
    {
      title: `Payment completed: Table ${order.tableNumber}`,
      message,
      type: "PAYMENT_SUCCESS",
      priority: "MEDIUM",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      metadata: {
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId || ""
      }
    },
    ["ADMIN", "KITCHEN", "STAFF"]
  );

  await createNotification(
    {
      title: "Payment completed",
      message: `Your payment via ${methodLabel} was successful.`,
      type: "PAYMENT_SUCCESS",
      priority: "MEDIUM",
      targetRole: "CUSTOMER",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      sessionId: order.sessionId,
      restaurantId: order.restaurantId,
      redirectUrl: receiptLinks?.paymentSuccessUrl || "",
      metadata: {
        paymentMethod: order.paymentMethod,
        transactionId: order.transactionId || "",
        receiptId: receiptLinks?.receiptId || order.receiptId || "",
        receiptNumber: receiptLinks?.receiptNumber || order.receiptNumber || "",
        receiptShareToken: receiptLinks?.receiptShareToken || order.receiptShareToken || "",
        receiptUrl: receiptLinks?.receiptUrl || "",
        paymentSuccessUrl: receiptLinks?.paymentSuccessUrl || ""
      }
    },
    { allowDuplicate: false }
  );
}

async function notifyPaymentFailure(order, options = {}) {
  const methodLabel = String(order.paymentMethod || order.paymentProvider || "Selected method").trim() || "Selected method";
  const message = options.message
    || `Payment failed for order ${order._id} via ${methodLabel}.`;

  await createNotificationsForRoles(
    {
      title: `Payment failed: Table ${order.tableNumber}`,
      message,
      type: "PAYMENT_FAILED",
      priority: "CRITICAL",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      metadata: {
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId || ""
      }
    },
    ["ADMIN", "KITCHEN", "STAFF"]
  );

  await createNotification(
    {
      title: "Payment failed",
      message: `Your payment via ${methodLabel} failed. Please try again.`,
      type: "PAYMENT_FAILED",
      priority: "HIGH",
      targetRole: "CUSTOMER",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      sessionId: order.sessionId,
      restaurantId: order.restaurantId,
      metadata: {
        paymentMethod: order.paymentMethod
      }
    },
    { allowDuplicate: false }
  );
}

async function notifyUpiApprovalRequired(order) {
  await createNotificationsForRoles(
    {
      title: `UPI payment pending approval: Table ${order.tableNumber}`,
      message: `Customer submitted UPI proof for bill ${order._id}. Verify the UTR/payment proof and approve if matched.`,
      type: "SYSTEM_ALERT",
      priority: "HIGH",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      metadata: {
        paymentMethod: order.paymentMethod,
        paymentProvider: order.paymentProvider,
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId || ""
      }
    },
    ["ADMIN", "STAFF"]
  );

  await createNotification(
    {
      title: "UPI payment submitted",
      message: "Your UPI payment details were submitted successfully. The restaurant will verify the UTR/proof and approve it shortly.",
      type: "SYSTEM_ALERT",
      priority: "MEDIUM",
      targetRole: "CUSTOMER",
      tableNumber: Number(order.tableNumber),
      orderId: String(order._id),
      sessionId: order.sessionId,
      restaurantId: order.restaurantId,
      metadata: {
        paymentStatus: order.paymentStatus,
        transactionId: order.transactionId || "",
        reviewStatus: "UNDER_REVIEW"
      }
    },
    { allowDuplicate: false }
  );
}

function buildPaymentReceiptPayload(order, receipt) {
  const receiptLinks = buildCustomerReceiptLinks(order, receipt || {
    _id: order.receiptId,
    receiptNumber: order.receiptNumber,
    shareToken: order.receiptShareToken
  });

  if (!receiptLinks) {
    return {};
  }

  return {
    receiptId: receiptLinks.receiptId,
    receiptNumber: receiptLinks.receiptNumber,
    receiptShareToken: receiptLinks.receiptShareToken,
    receiptUrl: receiptLinks.receiptUrl,
    paymentSuccessUrl: receiptLinks.paymentSuccessUrl
  };
}

// 1️⃣ Place Order (customer) - payment is NOT required at this step
router.post("/", ordersLimiter, async (req, res) => {
  try {
    const {
      tableNumber,
      customerName,
      phoneNumber,
      sessionId,
      items,
      total,
      restaurantId: reqRestaurantId
    } = req.body;

    const restaurantId = String(reqRestaurantId || DEFAULT_RESTAURANT).trim();

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found." });
    }

    await syncRestaurantLifecycle(restaurant);
    const restaurantAccess = buildRestaurantAccessState(restaurant);
    if (!restaurantAccess.publicOrderingEnabled) {
      return res.status(403).json({ error: restaurantAccess.publicMessage });
    }
    if (!restaurantAccess.canAcceptNewOrders) {
      return res.status(403).json({ error: restaurantAccess.orderRestrictionMessage });
    }

    if (!tableNumber || !customerName || !phoneNumber || !sessionId || !restaurantId) {
      return res.status(400).json({
        error: "restaurantId, table number, customer name, phone, and sessionId are required."
      });
    }

    const activeSession = await CustomerSession.findOne({
      restaurantId,
      tableNumber: Number(tableNumber),
      sessionId,
      active: true
    });

    if (!activeSession) {
      return res.status(403).json({ error: "No active session for this table." });
    }

    const occupancy = await getTableOccupancySnapshot(restaurantId, Number(tableNumber));
    if (!occupancy.tableExists) {
      return res.status(400).json({ error: "Invalid table QR code." });
    }
    if (occupancy.active && occupancy.session && String(occupancy.session.sessionId || "") !== String(sessionId).trim()) {
      return res.status(409).json({ error: `Table ${tableNumber} is currently occupied.` });
    }

    const normalizedItems = normalizeItems(items);
    if (!normalizedItems.length) {
      return res.status(400).json({ error: "At least one item is required." });
    }

    const computedTotal = normalizedItems.reduce((sum, item) => {
      return sum + Number(item.price || 0) * Number(item.qty || 0);
    }, 0);
    const baseTotal = Number((toPositiveNumber(total, computedTotal) || computedTotal).toFixed(2));

    let order = await findActiveBill(restaurantId, Number(tableNumber), String(sessionId).trim());
    const isExistingBill = Boolean(order);

    if (!order) {
      order = new Order({
        tableNumber: Number(tableNumber),
        customerName: String(customerName).trim(),
        phoneNumber: String(phoneNumber).trim(),
        sessionId: String(sessionId).trim(),
        items: [],
        billItems: [],
        total: 0,
        restaurantId,
        billStatus: BILL_STATUS.OPEN,
        paymentMethodId: "",
        paymentMethod: "",
        paymentProvider: "",
        paymentType: "OFFLINE",
        paymentStatus: PAYMENT_STATUS.PENDING,
        transactionId: "",
        paymentAttemptId: "",
        convenienceFee: 0,
        payableTotal: 0,
        paymentInstructions: "",
        paymentGatewayResponse: {},
        paymentTransactions: [],
        paidAt: null,
        paymentRequestedAt: null,
        paymentProof: null,
        status: "Pending"
      });
    }

    appendItemsToBill(order, normalizedItems, {
      customerName,
      phoneNumber,
      sessionId
    });

    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));
    order.status = deriveBillStatus(order);

    await order.save();
    await touchSessionActivity({
      restaurantId,
      tableNumber: Number(tableNumber),
      sessionId: String(sessionId).trim()
    });

    await Table.findOneAndUpdate(
      { restaurantId, tableNumber: Number(tableNumber) },
      {
        status: "occupied",
        customerName,
        phoneNumber,
        activeSession: true,
        updatedAt: new Date()
      },
      { upsert: true }
    );

    const itemCount = Array.isArray(normalizedItems) ? normalizedItems.length : 0;
    const responseOrder = buildOrderResponse(order);

    await createNotificationsForRoles(
      {
        title: isExistingBill ? `Items added from Table ${tableNumber}` : `New order from Table ${tableNumber}`,
        message: isExistingBill
          ? `${customerName} added items worth ₹${baseTotal} to the running bill.`
          : `${customerName} placed an order worth ₹${baseTotal}.`,
        type: "NEW_ORDER",
        priority: "HIGH",
        tableNumber: Number(tableNumber),
        orderId: String(order._id),
        restaurantId,
        metadata: {
          itemCount,
          totalAmount: baseTotal,
          paymentStatus: PAYMENT_STATUS.PENDING
        }
      },
      ["ADMIN", "STAFF"]
    );

    await createNotification({
      title: isExistingBill ? `Additional items: Table ${tableNumber}` : `New order received: Table ${tableNumber}`,
      message: isExistingBill
        ? `${customerName} added more items to the running bill.`
        : `${customerName} placed a new order. Start preparation.`,
      type: "NEW_ORDER",
      priority: "HIGH",
      targetRole: "KITCHEN",
      tableNumber: Number(tableNumber),
      orderId: String(order._id),
      restaurantId,
      metadata: {
        itemCount,
        totalAmount: baseTotal
      }
    });

    await createNotification({
      title: isExistingBill ? "Items added to your running bill" : "Order placed successfully",
      message: isExistingBill
        ? "Your new items were added to the active bill. Payment will be enabled after serving."
        : "Your order was placed successfully. Payment will be enabled after serving.",
      type: "NEW_ORDER",
      priority: "MEDIUM",
      targetRole: "CUSTOMER",
      tableNumber: Number(tableNumber),
      orderId: String(order._id),
      sessionId,
      restaurantId,
      soundEnabled: false,
      metadata: {
        customerName,
        totalAmount: baseTotal,
        paymentStatus: PAYMENT_STATUS.PENDING
      }
    });

    await createNotificationsForRoles(
      {
        title: `Table ${tableNumber} is occupied`,
        message: `Table ${tableNumber} is now occupied by ${customerName}.`,
        type: "TABLE_OCCUPIED",
        priority: "MEDIUM",
        tableNumber: Number(tableNumber),
        restaurantId,
        metadata: {
          source: "order-created"
        }
      },
      ["ADMIN", "STAFF"]
    );

    emitNewOrder(responseOrder);
    return res.json(responseOrder);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2️⃣ Get All Orders (Owner)
router.get("/", verifyOwnerToken, async (req, res) => {
  try {
    const orders = await Order.find({ restaurantId: req.owner.restaurantId }).sort({ createdAt: -1 });
    await Promise.all(orders.map(async order => {
      const needsMigration = (!Array.isArray(order.billItems) || !order.billItems.length) && Array.isArray(order.items) && order.items.length;
      const missingReceipt = normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS && !String(order.receiptId || "").trim();
      if (needsMigration) {
        ensureBillItems(order);
      }
      if (missingReceipt) {
        await upsertReceiptForOrder(order);
      }
      if (needsMigration || missingReceipt) {
        await order.save();
      }
    }));
    return res.json(orders.map(order => buildOrderResponse(order)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2️⃣b Get single order (public for status tracking)
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const needsMigration = (!Array.isArray(order.billItems) || !order.billItems.length) && Array.isArray(order.items) && order.items.length;
    const missingReceipt = normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS && !String(order.receiptId || "").trim();
    if (needsMigration) {
      ensureBillItems(order);
    }
    if (missingReceipt) {
      await upsertReceiptForOrder(order);
    }
    if (needsMigration || missingReceipt) {
      await order.save();
    }
    return res.json(buildOrderResponse(order));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2️⃣c Get payment options for a specific order (customer session scoped)
router.get("/:id/payment-options", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    const needsMigration = order && ((!Array.isArray(order.billItems) || !order.billItems.length) && Array.isArray(order.items) && order.items.length);
    if (needsMigration) {
      ensureBillItems(order);
    }
    const missingReceipt = order
      && normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS
      && !String(order.receiptId || "").trim();
    if (missingReceipt) {
      await upsertReceiptForOrder(order);
    }
    if (needsMigration || missingReceipt) {
      await order.save();
    }
    const access = await validateCustomerOrderAccess(order, {
      restaurantId: req.query.restaurantId,
      tableNumber: req.query.tableNumber,
      sessionId: req.query.sessionId
    });

    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const orderPaymentStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    const lockedBecausePaid = orderPaymentStatus === PAYMENT_STATUS.SUCCESS;
    const lockedBecauseNotServed = !isBillServed(order);
    const responseOrder = buildOrderResponse(order);

    const paymentOptions = await getCustomerPaymentOptions(order.restaurantId);

    let defaultMethodId = String(order.paymentMethodId || "").trim();
    if (!defaultMethodId) {
      defaultMethodId = String(paymentOptions.defaultMethodId || "").trim();
    }

    const methods = sortMethodsWithDefaultFirst(paymentOptions.methods || [], defaultMethodId);

    console.log("[order-payment-options]", {
      orderId: String(order._id),
      restaurantId: access.restaurantId,
      tableNumber: access.tableNumber,
      sessionId: access.sessionId,
      methods: methods.map(method => ({
        methodId: method.methodId,
        providerName: method.providerName,
        type: method.type,
        enabled: method.enabled,
        isDefault: method.isDefault
      }))
    });

    return res.json({
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      tableNumber: Number(order.tableNumber),
      status: responseOrder.status,
      total: Number(responseOrder.total || 0),
      payableTotal: Number(responseOrder.payableTotal || responseOrder.total || 0),
      paymentStatus: orderPaymentStatus,
      paymentMethodId: order.paymentMethodId || "",
      paymentMethod: order.paymentMethod || "",
      paymentProvider: order.paymentProvider || "",
      transactionId: order.transactionId || "",
      paidAt: order.paidAt,
      paymentRequestedAt: order.paymentRequestedAt,
      billStatus: order.billStatus || BILL_STATUS.OPEN,
      billItems: responseOrder.billItems,
      paymentLocked: lockedBecausePaid || lockedBecauseNotServed,
      paymentLockMessage: lockedBecausePaid
        ? "Payment already completed for this bill."
        : lockedBecauseNotServed
          ? "Payment will be enabled after all items are served"
          : "",
      methods,
      defaultMethodId: methods.find(method => method.isDefault)?.methodId || methods[0]?.methodId || "",
      minimumOnlineAmount: Number(paymentOptions.minimumOnlineAmount || 0),
      convenienceFee: Number(paymentOptions.convenienceFee || 0),
      paymentInstructions: String(paymentOptions.paymentInstructions || ""),
      ...buildPaymentReceiptPayload(order)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2️⃣d Initiate payment after order is served (customer session scoped)
router.post("/:id/payment/initiate", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    const access = await validateCustomerOrderAccess(order, {
      restaurantId: req.body.restaurantId,
      tableNumber: req.body.tableNumber,
      sessionId: req.body.sessionId
    });

    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const currentPaymentStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    if (currentPaymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(409).json({ error: "Payment already completed for this order." });
    }

    if (!isBillServed(order)) {
      return res.status(400).json({ error: "Payment will be enabled after all items are served" });
    }

    const paymentOptions = await getCustomerPaymentOptions(order.restaurantId);
    const methods = paymentOptions.methods || [];

    const requestedMethodId = String(req.body.paymentMethodId || "").trim();
    const selectedMethod = requestedMethodId
      ? methods.find(method => String(method.methodId || "") === requestedMethodId)
      : methods.find(method => method.isDefault) || methods[0];

    if (!selectedMethod) {
      return res.status(400).json({ error: "No enabled payment methods available." });
    }

    console.log("[order-payment-initiate]", {
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      tableNumber: Number(order.tableNumber),
      methodId: selectedMethod.methodId,
      providerName: selectedMethod.providerName,
      type: selectedMethod.type
    });

    const paymentSettings = await getOrCreatePaymentSettings(order.restaurantId);
    const resolvedMethod = resolveMethodForOrder(paymentSettings, selectedMethod.methodId);
    const isUpi = isUpiMethod(selectedMethod) || isUpiMethod(resolvedMethod);

    ensureBillItems(order);

    const convenienceFee = selectedMethod.type === "ONLINE"
      ? toPositiveNumber(paymentSettings.convenienceFee, 0)
      : 0;
    const subtotal = Number(computeBillSubtotal(order).toFixed(2));
    const payableTotal = Number((subtotal + convenienceFee).toFixed(2));
    const minimumOnlineAmount = toPositiveNumber(paymentSettings.minimumOnlineAmount, 0);

    if (selectedMethod.type === "ONLINE" && payableTotal < minimumOnlineAmount) {
      return res.status(400).json({
        error: `Minimum order amount for ${selectedMethod.displayName} is ₹${minimumOnlineAmount}.`
      });
    }

    let paymentIntent = {
      provider: selectedMethod.providerName,
      paymentStatus: PAYMENT_STATUS.INITIATED,
      transactionId: "",
      gatewayResponse: {}
    };

    try {
      paymentIntent = createPayment({
        method: resolvedMethod,
        order: {
          restaurantId: order.restaurantId,
          total: subtotal,
          convenienceFee,
          payableTotal
        },
        credentials: getMethodCredentials(resolvedMethod, paymentSettings)
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const attemptId = createPaymentAttemptId();
    const normalizedProvider = normalizeProviderName(selectedMethod.providerName || "");

    order.paymentMethodId = selectedMethod.methodId;
    order.paymentMethod = normalizePaymentMethodCode(normalizedProvider || selectedMethod.displayName || selectedMethod.providerName || "");
    order.paymentProvider = normalizedProvider;
    order.paymentType = selectedMethod.type === "ONLINE" ? "ONLINE" : "OFFLINE";
    order.paymentAttemptId = attemptId;
    order.paymentRequestedAt = new Date();
    order.paymentInstructions = String(selectedMethod.instructions || paymentOptions.paymentInstructions || "");
    order.convenienceFee = convenienceFee;
    order.payableTotal = payableTotal;
    order.paymentGatewayResponse = paymentIntent.gatewayResponse || {};
    order.total = subtotal;

    let nextPaymentStatus = PAYMENT_STATUS.INITIATED;

    if (selectedMethod.type !== "ONLINE" && !isUpi) {
      nextPaymentStatus = PAYMENT_STATUS.SUCCESS;
    }

    order.paymentStatus = nextPaymentStatus;
    order.transactionId = String(paymentIntent.transactionId || "").trim();
    order.paidAt = nextPaymentStatus === PAYMENT_STATUS.SUCCESS ? new Date() : null;
    upsertPaymentTransaction(order, {
      attemptId,
      provider: normalizedProvider,
      paymentMethodId: selectedMethod.methodId,
      paymentMethod: order.paymentMethod,
      gatewayOrderId: String(paymentIntent.gatewayResponse?.providerOrderId || ""),
      gatewayPaymentId: order.transactionId,
      amount: payableTotal,
      currency: "INR",
      status: nextPaymentStatus,
      verifiedAt: nextPaymentStatus === PAYMENT_STATUS.SUCCESS ? new Date() : null,
      gatewayResponse: paymentIntent.gatewayResponse || {}
    });

    let receipt = null;
    if (nextPaymentStatus === PAYMENT_STATUS.SUCCESS) {
      receipt = await upsertReceiptForOrder(order);
    }

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    if (nextPaymentStatus === PAYMENT_STATUS.SUCCESS) {
      await notifyPaymentSuccess(order, {
        message: `Payment received for bill ${order._id} via ${order.paymentMethod || order.paymentProvider || "selected method"}.`,
        receipt
      });
      await closeBillIfSettled(order);
    }

    return res.json({
      orderId: String(order._id),
      paymentAttemptId: order.paymentAttemptId,
      paymentMethodId: order.paymentMethodId,
      paymentMethod: order.paymentMethod,
      paymentProvider: order.paymentProvider,
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      total: Number(order.total || 0),
      convenienceFee: Number(order.convenienceFee || 0),
      payableTotal: Number(order.payableTotal || order.total || 0),
      paidAt: order.paidAt,
      requiresUpiConfirmation: isUpi,
      requiresGatewayVerification: selectedMethod.type === "ONLINE" && !isUpi,
      gatewayResponse: paymentIntent.gatewayResponse || {},
      ...buildPaymentReceiptPayload(order, receipt),
      message: nextPaymentStatus === PAYMENT_STATUS.SUCCESS
        ? "Payment completed successfully."
        : isUpi
          ? "UPI selected. Pay using the UPI ID or QR code, then submit the UTR or screenshot. The restaurant will review and approve it."
          : "Payment initiated. Complete payment to continue."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 2️⃣e Customer confirms UPI payment with UTR (optional screenshot)
router.post("/:id/payment/confirm-upi", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    const access = await validateCustomerOrderAccess(order, {
      restaurantId: req.body.restaurantId,
      tableNumber: req.body.tableNumber,
      sessionId: req.body.sessionId
    });

    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    const currentPaymentStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    if (currentPaymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(409).json({ error: "Payment already completed for this order." });
    }

    if (!isBillServed(order)) {
      return res.status(400).json({ error: "Payment will be enabled after all items are served" });
    }

    const paymentOptions = await getCustomerPaymentOptions(order.restaurantId);
    const requestedMethodId = String(req.body.paymentMethodId || order.paymentMethodId || "").trim();

    const upiMethods = (paymentOptions.methods || []).filter(method => isUpiMethod(method));
    const selectedMethod = requestedMethodId
      ? upiMethods.find(method => String(method.methodId || "") === requestedMethodId)
      : upiMethods.find(method => method.isDefault) || upiMethods[0];

    if (!selectedMethod) {
      return res.status(400).json({ error: "No enabled UPI payment method is available." });
    }

    const utr = String(req.body.utr || req.body.transactionId || "").trim();
    if (!utr || utr.length < 6) {
      return res.status(400).json({ error: "Please provide a valid UTR / transaction reference number." });
    }

    console.log("[order-payment-confirm-upi]", {
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      tableNumber: Number(order.tableNumber),
      methodId: selectedMethod.methodId,
      providerName: selectedMethod.providerName,
      utr
    });

    const proof = sanitizeProofPayload(req.body.paymentProof || {});

    if (
      normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.INITIATED
      && String(order.paymentMethodId || "") === String(selectedMethod.methodId || "")
      && String(order.transactionId || "").trim() === utr
    ) {
      return res.status(409).json({ error: "UPI payment confirmation already submitted." });
    }

    order.paymentMethodId = selectedMethod.methodId;
    order.paymentMethod = normalizePaymentMethodCode(selectedMethod.providerName || selectedMethod.displayName || "UPI");
    order.paymentProvider = normalizeProviderName(selectedMethod.providerName || "UPI");
    order.paymentType = "ONLINE";
    order.paymentStatus = PAYMENT_STATUS.INITIATED;
    order.paymentRequestedAt = new Date();
    order.paymentAttemptId = order.paymentAttemptId || createPaymentAttemptId();
    order.transactionId = utr;
    order.paymentInstructions = String(selectedMethod.instructions || paymentOptions.paymentInstructions || "");
    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      upiId: selectedMethod.upiId || "",
      qrImageUrl: selectedMethod.qrImageUrl || "",
      utr,
      submittedAt: new Date().toISOString()
    };
    if (proof) {
      order.paymentProof = proof;
    }
    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: order.paymentProvider,
      paymentMethodId: selectedMethod.methodId,
      paymentMethod: order.paymentMethod,
      gatewayPaymentId: utr,
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: PAYMENT_STATUS.INITIATED,
      gatewayResponse: {
        upiId: selectedMethod.upiId || "",
        qrImageUrl: selectedMethod.qrImageUrl || "",
        proofUploaded: Boolean(proof)
      }
    });

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));
    await notifyUpiApprovalRequired(order);

    return res.json({
      orderId: String(order._id),
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      reviewStatus: "UNDER_REVIEW",
      message: "UPI details submitted successfully. Verification is in progress and the restaurant will approve once confirmed."
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 2️⃣f Verify online payment callback/status from customer gateway flow
router.post("/:id/payment/verify-online", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    const access = await validateCustomerOrderAccess(order, {
      restaurantId: req.body.restaurantId,
      tableNumber: req.body.tableNumber,
      sessionId: req.body.sessionId
    });

    if (!access.ok) {
      return res.status(access.status).json({ error: access.error });
    }

    if (!isBillServed(order)) {
      return res.status(400).json({ error: "Payment will be enabled after all items are served" });
    }

    if (normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS) {
      return res.status(409).json({ error: "Payment already completed for this order." });
    }

    const paymentSettings = await getOrCreatePaymentSettings(order.restaurantId);
    const methodId = String(req.body.paymentMethodId || order.paymentMethodId || "").trim();
    const selectedMethod = resolveMethodForOrder(paymentSettings, methodId);

    if (!selectedMethod || selectedMethod.type !== "ONLINE" || isUpiMethod(selectedMethod)) {
      return res.status(400).json({ error: "Online gateway verification is not applicable for this method." });
    }

    const statusInput = String(req.body.status || req.body.paymentStatus || "").trim().toUpperCase();
    const paymentData = {
      ...(req.body.paymentData && typeof req.body.paymentData === "object" ? req.body.paymentData : {}),
      status: statusInput || "PENDING",
      transactionId: String(req.body.transactionId || req.body?.paymentData?.transactionId || order.transactionId || "").trim()
    };

    const verification = verifyPayment({
      method: selectedMethod,
      paymentData,
      credentials: getMethodCredentials(selectedMethod, paymentSettings)
    });

    const nextStatus = normalizePaymentStatus(verification.paymentStatus, PAYMENT_STATUS.INITIATED);

    order.paymentMethodId = selectedMethod.methodId;
    order.paymentMethod = normalizePaymentMethodCode(selectedMethod.providerName || selectedMethod.displayName || "");
    order.paymentProvider = normalizeProviderName(selectedMethod.providerName || "");
    order.paymentType = "ONLINE";
    order.paymentAttemptId = order.paymentAttemptId || createPaymentAttemptId();
    order.paymentRequestedAt = order.paymentRequestedAt || new Date();
    order.paymentStatus = nextStatus;
    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));
    order.transactionId = String(
      verification.transactionId
      || paymentData.transactionId
      || order.transactionId
      || ""
    ).trim();
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      ...(req.body.paymentData && typeof req.body.paymentData === "object" ? req.body.paymentData : {}),
      verificationStatus: nextStatus,
      verifiedAt: new Date().toISOString()
    };
    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: order.paymentProvider,
      paymentMethodId: selectedMethod.methodId,
      paymentMethod: order.paymentMethod,
      gatewayPaymentId: order.transactionId,
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: nextStatus,
      verifiedAt: nextStatus === PAYMENT_STATUS.SUCCESS ? new Date() : null,
      gatewayResponse: req.body.paymentData && typeof req.body.paymentData === "object" ? req.body.paymentData : {}
    });

    if (nextStatus === PAYMENT_STATUS.SUCCESS) {
      order.paidAt = new Date();
    } else if (nextStatus === PAYMENT_STATUS.FAILED) {
      order.paidAt = null;
    }

    let receipt = null;
    if (nextStatus === PAYMENT_STATUS.SUCCESS) {
      receipt = await upsertReceiptForOrder(order);
    }

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    if (nextStatus === PAYMENT_STATUS.SUCCESS) {
      await notifyPaymentSuccess(order, { receipt });
      await closeBillIfSettled(order);
    }

    if (nextStatus === PAYMENT_STATUS.FAILED) {
      await notifyPaymentFailure(order);
    }

    return res.json({
      orderId: String(order._id),
      paymentStatus: order.paymentStatus,
      transactionId: order.transactionId,
      paidAt: order.paidAt,
      ...buildPaymentReceiptPayload(order, receipt),
      message: order.paymentStatus === PAYMENT_STATUS.SUCCESS
        ? "Payment verified successfully."
        : order.paymentStatus === PAYMENT_STATUS.FAILED
          ? "Payment verification failed."
          : "Payment is still pending verification."
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 2️⃣g Owner action: approve UPI payment manually
router.post("/:id/payment/approve-upi", verifyOwnerToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.owner.restaurantId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (!isUpiMethod({
      providerName: order.paymentProvider,
      paymentProvider: order.paymentProvider,
      paymentMethod: order.paymentMethod,
      paymentGatewayResponse: order.paymentGatewayResponse
    })) {
      return res.status(400).json({ error: "This order does not have a UPI payment pending approval." });
    }

    if (normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS) {
      return res.json(order);
    }

    const manualTransactionId = String(req.body.transactionId || "").trim();
    if (manualTransactionId) {
      order.transactionId = manualTransactionId;
    }

    order.paymentStatus = PAYMENT_STATUS.SUCCESS;
    order.paidAt = new Date();
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      approvedByOwnerId: req.owner.ownerId,
      approvedAt: new Date().toISOString()
    };
    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: order.paymentProvider,
      paymentMethodId: order.paymentMethodId,
      paymentMethod: order.paymentMethod,
      gatewayPaymentId: order.transactionId,
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: PAYMENT_STATUS.SUCCESS,
      verifiedAt: new Date(),
      gatewayResponse: {
        approvedByOwnerId: req.owner.ownerId
      }
    });

    const receipt = await upsertReceiptForOrder(order);

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));
    await notifyPaymentSuccess(order, {
      message: `UPI payment approved for order ${order._id}.`,
      receipt
    });
    await closeBillIfSettled(order);

    return res.json(buildOrderResponse(order));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 2️⃣h Owner action: mark payment success for non-UPI/manual payments
router.post("/:id/payment/mark-success", verifyOwnerToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.owner.restaurantId });
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (normalizePaymentStatus(order.paymentStatus) === PAYMENT_STATUS.SUCCESS) {
      return res.json(order);
    }

    const transactionId = String(req.body.transactionId || order.transactionId || "").trim();
    if (transactionId) {
      order.transactionId = transactionId;
    }

    order.paymentStatus = PAYMENT_STATUS.SUCCESS;
    order.paidAt = new Date();
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      markedByOwnerId: req.owner.ownerId,
      markedAt: new Date().toISOString()
    };
    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: order.paymentProvider,
      paymentMethodId: order.paymentMethodId,
      paymentMethod: order.paymentMethod,
      gatewayPaymentId: order.transactionId,
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: PAYMENT_STATUS.SUCCESS,
      verifiedAt: new Date(),
      gatewayResponse: {
        markedByOwnerId: req.owner.ownerId
      }
    });

    const receipt = await upsertReceiptForOrder(order);

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));
    await notifyPaymentSuccess(order, {
      message: `Payment manually marked as success for order ${order._id}.`,
      receipt
    });
    await closeBillIfSettled(order);

    return res.json(buildOrderResponse(order));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// 3️⃣ Update Order Status
router.patch("/:id", verifyOwnerToken, async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, restaurantId: req.owner.restaurantId });
    if (!order) {
      return res.json(null);
    }

    ensureBillItems(order);

    const previousStatus = deriveBillStatus(order);
    const nextStatus = formatOrderStatusForStorage(req.body.status, previousStatus);
    const billItemIds = Array.isArray(req.body.billItemIds)
      ? req.body.billItemIds
      : req.body.billItemId
        ? [req.body.billItemId]
        : [];

    if (isOrderCompleted(nextStatus) && normalizePaymentStatus(order.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
      return res.status(400).json({
        error: "Bill cannot be marked Completed until payment is successful."
      });
    }

    if (isOrderCompleted(nextStatus)) {
      closeBill(order);
    } else {
      markBillItems(order, billItemIds, nextStatus);
    }

    order.status = deriveBillStatus(order);
    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));

    if (isBillServed(order) && !order.paymentRequestedAt && normalizePaymentStatus(order.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
      order.paymentRequestedAt = new Date();
    }

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    const statusChanged = normalizeOrderStatusKey(previousStatus) !== normalizeOrderStatusKey(order.status);

    if (statusChanged) {
      const notificationType = mapOrderStatusToNotificationType(order.status);
      const statusText = String(order.status || "").trim();

      await createNotificationsForRoles(
        {
          title: `Order update: Table ${order.tableNumber}`,
          message: `Bill ${order._id} for table ${order.tableNumber} moved from ${previousStatus} to ${statusText}.`,
          type: notificationType,
          priority: notificationType === "ORDER_READY" ? "HIGH" : undefined,
          tableNumber: Number(order.tableNumber),
          orderId: String(order._id),
          restaurantId: order.restaurantId,
          metadata: {
            previousStatus,
            currentStatus: statusText
          }
        },
        ["ADMIN", "KITCHEN", "STAFF"]
      );

      await createNotification(
        {
          title: "Your order status changed",
          message: `Order for table ${order.tableNumber} is now ${statusText}.`,
          type: notificationType,
          priority: notificationType === "ORDER_READY" ? "HIGH" : "MEDIUM",
          targetRole: "CUSTOMER",
          tableNumber: Number(order.tableNumber),
          orderId: String(order._id),
          sessionId: order.sessionId,
          restaurantId: order.restaurantId,
          metadata: {
            previousStatus,
            currentStatus: statusText
          }
        },
        { allowDuplicate: false }
      );

      if (normalizeOrderStatusKey(order.status) === "SERVED" && normalizePaymentStatus(order.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
        await createNotification(
          {
            title: "Order served, please make payment",
            message: "Your order has been served. Please complete payment now.",
            type: "ORDER_SERVED",
            priority: "HIGH",
            targetRole: "CUSTOMER",
            tableNumber: Number(order.tableNumber),
            orderId: String(order._id),
            sessionId: order.sessionId,
            restaurantId: order.restaurantId,
            metadata: {
              paymentStatus: order.paymentStatus,
              payableTotal: Number(order.payableTotal || order.total || 0)
            }
          },
          { allowDuplicate: false }
        );
      }
    }

    if (isOrderCompleted(order.status)) {
      await releaseTableForOrder(order);
    }

    return res.json(buildOrderResponse(order));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4️⃣ Delete Order
router.delete("/:id", verifyOwnerToken, async (req, res) => {
  try {
    await Order.findOneAndDelete({ _id: req.params.id, restaurantId: req.owner.restaurantId });
    return res.json({ message: "Order deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
