const crypto = require("crypto");
const express = require("express");

const Order = require("../models/Order");
const CustomerSession = require("../models/CustomerSession");
const Table = require("../models/Table");
const {
  PAYMENT_STATUS,
  ensureBillItems,
  computeBillSubtotal,
  buildOrderResponse,
  upsertPaymentTransaction,
  closeBill,
  isBillServed
} = require("../services/billService");
const {
  getCustomerPaymentOptions,
  getOrCreatePaymentSettings,
  getMethodCredentials,
  normalizeProviderName
} = require("../services/payments/paymentSettingsService");
const {
  toPaise,
  getRazorpayCredentials,
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature
} = require("../services/payments/razorpayGateway");
const {
  createNotification,
  createNotificationsForRoles
} = require("../services/notificationService");
const {
  upsertReceiptForOrder,
  buildCustomerReceiptLinks
} = require("../services/receiptService");
const { emitOrderUpdated } = require("../socketEmitter");

const SUPPORTED_WEBHOOK_EVENTS = new Set(["payment.captured", "payment.failed", "order.paid"]);

const customerRouter = express.Router();
const webhookRouter = express.Router();

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

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function normalizePaymentMethodCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function createPaymentAttemptId() {
  if (crypto.randomUUID) {
    return `pay_${crypto.randomUUID()}`;
  }
  return `pay_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

function isRazorpayProvider(value = "") {
  return normalizeProviderName(value) === "RAZORPAY";
}

function getMethodLabel(order = {}) {
  return String(order.paymentMethod || order.paymentProvider || "Selected method").trim() || "Selected method";
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

  return { ok: true, restaurantId, tableNumber: Number(tableNumber), sessionId, session };
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
  const methodLabel = getMethodLabel(order);
  const message = options.message || `Payment completed for order ${order._id} via ${methodLabel}.`;
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
  const methodLabel = getMethodLabel(order);
  const message = options.message || `Payment failed for order ${order._id} via ${methodLabel}.`;

  await createNotificationsForRoles(
    {
      title: `Payment failed: Table ${order.tableNumber}`,
      message,
      type: "PAYMENT_FAILED",
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

function getExistingRazorpayOrderId(order = {}) {
  return String(
    order?.paymentGatewayResponse?.razorpayOrderId
    || order?.paymentGatewayResponse?.orderId
    || ""
  ).trim();
}

function buildCreateOrderResponse(order, razorpayPayload = {}, options = {}) {
  return {
    orderId: String(order._id),
    paymentAttemptId: String(order.paymentAttemptId || ""),
    paymentMethodId: String(order.paymentMethodId || ""),
    paymentMethod: String(order.paymentMethod || ""),
    paymentProvider: String(order.paymentProvider || ""),
    paymentStatus: normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING),
    convenienceFee: Number(order.convenienceFee || 0),
    payableTotal: Number(order.payableTotal || order.total || 0),
    transactionId: String(order.transactionId || ""),
    paidAt: order.paidAt || null,
    razorpay: {
      keyId: String(razorpayPayload.keyId || ""),
      orderId: String(razorpayPayload.orderId || ""),
      amount: Number(razorpayPayload.amount || 0),
      currency: String(razorpayPayload.currency || "INR"),
      name: String(razorpayPayload.name || "HotelMenu"),
      description: String(razorpayPayload.description || `Payment for order ${order._id}`),
      notes: razorpayPayload.notes && typeof razorpayPayload.notes === "object"
        ? razorpayPayload.notes
        : {}
    },
    ...buildPaymentReceiptPayload(order),
    message: options.message || "Razorpay checkout order created."
  };
}

function getWebhookEntity(payload = {}) {
  const paymentEntity = payload?.payload?.payment?.entity || {};
  const orderEntity = payload?.payload?.order?.entity || {};
  const notes = paymentEntity?.notes && typeof paymentEntity.notes === "object"
    ? paymentEntity.notes
    : orderEntity?.notes && typeof orderEntity.notes === "object"
      ? orderEntity.notes
      : {};

  return {
    event: String(payload.event || "").trim(),
    razorpayPaymentId: String(paymentEntity.id || "").trim(),
    razorpayOrderId: String(paymentEntity.order_id || orderEntity.id || "").trim(),
    orderId: String(notes.orderId || notes.order_id || "").trim(),
    restaurantId: String(notes.restaurantId || notes.restaurant_id || "").trim(),
    status: String(paymentEntity.status || orderEntity.status || "").trim(),
    method: String(paymentEntity.method || "").trim(),
    notes
  };
}

function readRequestOrderId(req) {
  return String(req.body?.orderId || req.body?.order_id || "").trim();
}

function readRequestedMethodId(req) {
  return String(req.body?.paymentMethodId || "").trim();
}

async function resolveRazorpayMethod(order, requestedMethodId = "") {
  const paymentOptions = await getCustomerPaymentOptions(order.restaurantId);
  const methods = Array.isArray(paymentOptions.methods) ? paymentOptions.methods : [];
  const requestedId = String(requestedMethodId || "").trim();

  const exactMethod = requestedId
    ? methods.find(method => String(method.methodId || "") === requestedId)
    : null;
  const fallbackMethod = methods.find(method => isRazorpayProvider(method.providerName));
  const selectedMethod = exactMethod || fallbackMethod;

  if (!selectedMethod || !isRazorpayProvider(selectedMethod.providerName)) {
    return {
      error: "Razorpay is not enabled for this restaurant. Enable Razorpay in payment settings and try again."
    };
  }

  return {
    selectedMethod,
    paymentOptions
  };
}

customerRouter.post("/create-order", async (req, res) => {
  try {
    const orderId = readRequestOrderId(req);
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const order = await Order.findById(orderId);
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

    const currentPaymentStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    if (currentPaymentStatus === PAYMENT_STATUS.SUCCESS) {
      return res.status(409).json({ error: "Payment already completed for this order." });
    }

    const methodResolution = await resolveRazorpayMethod(order, readRequestedMethodId(req));
    if (methodResolution.error) {
      return res.status(400).json({ error: methodResolution.error });
    }

    const { selectedMethod, paymentOptions } = methodResolution;
    const paymentSettings = await getOrCreatePaymentSettings(order.restaurantId);
    const credentialsFromMethod = getMethodCredentials(selectedMethod, paymentSettings);
    const credentials = getRazorpayCredentials(credentialsFromMethod);

    ensureBillItems(order);

    const convenienceFee = selectedMethod.type === "ONLINE"
      ? toPositiveNumber(paymentSettings.convenienceFee, 0)
      : 0;
    const subtotal = Number(computeBillSubtotal(order).toFixed(2));
    const payableTotal = Number((subtotal + convenienceFee).toFixed(2));
    const minimumOnlineAmount = toPositiveNumber(paymentSettings.minimumOnlineAmount, 0);
    if (payableTotal < minimumOnlineAmount) {
      return res.status(400).json({
        error: `Minimum order amount for ${selectedMethod.displayName} is ₹${minimumOnlineAmount}.`
      });
    }

    const existingRazorpayOrderId = getExistingRazorpayOrderId(order);
    const forceNewAttempt = req.body?.forceNewAttempt === true;
    if (
      currentPaymentStatus === PAYMENT_STATUS.INITIATED
      && existingRazorpayOrderId
      && !forceNewAttempt
    ) {
      return res.json(buildCreateOrderResponse(
        order,
        {
          keyId: credentials.keyId,
          orderId: existingRazorpayOrderId,
          amount: Number(order.paymentGatewayResponse?.razorpayAmount || toPaise(payableTotal, 0)),
          currency: String(order.paymentGatewayResponse?.razorpayCurrency || "INR"),
          name: process.env.RAZORPAY_CHECKOUT_NAME || "HotelMenu",
          description: `Payment for order ${order._id}`,
          notes: order.paymentGatewayResponse?.notes || {}
        },
        { message: "Using existing Razorpay payment attempt." }
      ));
    }

    const amountPaise = toPaise(payableTotal, 0);
    if (!amountPaise) {
      return res.status(400).json({ error: "Payable amount must be greater than 0." });
    }

    const receipt = `ord_${String(order._id).slice(-12)}_${Date.now().toString().slice(-8)}`.slice(0, 40);
    const notes = {
      orderId: String(order._id),
      restaurantId: String(order.restaurantId),
      tableNumber: String(order.tableNumber),
      sessionId: String(order.sessionId || "")
    };

    const razorpayOrder = await createRazorpayOrder({
      amountPaise,
      currency: "INR",
      receipt,
      notes,
      credentials
    });

    const attemptId = createPaymentAttemptId();
    order.paymentMethodId = selectedMethod.methodId;
    order.paymentMethod = normalizePaymentMethodCode(selectedMethod.providerName || selectedMethod.displayName || "RAZORPAY");
    order.paymentProvider = "RAZORPAY";
    order.paymentType = "ONLINE";
    order.paymentStatus = PAYMENT_STATUS.INITIATED;
    order.paymentAttemptId = attemptId;
    order.paymentRequestedAt = new Date();
    order.paymentInstructions = String(selectedMethod.instructions || paymentOptions.paymentInstructions || "");
    order.convenienceFee = convenienceFee;
    order.payableTotal = payableTotal;
    order.total = subtotal;
    order.transactionId = "";
    order.paidAt = null;
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      provider: "RAZORPAY",
      razorpayOrderId: razorpayOrder.id,
      razorpayOrderStatus: razorpayOrder.status,
      razorpayAmount: razorpayOrder.amount,
      razorpayCurrency: razorpayOrder.currency,
      razorpayReceipt: razorpayOrder.receipt,
      notes,
      latestAttemptId: attemptId,
      lastEvent: "ORDER_CREATED",
      lastEventAt: new Date().toISOString()
    };
    upsertPaymentTransaction(order, {
      attemptId,
      provider: "RAZORPAY",
      paymentMethodId: selectedMethod.methodId,
      paymentMethod: order.paymentMethod,
      gatewayOrderId: razorpayOrder.id,
      amount: payableTotal,
      currency: razorpayOrder.currency,
      status: PAYMENT_STATUS.INITIATED,
      gatewayResponse: {
        razorpayOrderId: razorpayOrder.id,
        razorpayReceipt: razorpayOrder.receipt,
        notes
      }
    });

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    console.log("[razorpay-create-order]", {
      orderId: String(order._id),
      restaurantId: order.restaurantId,
      tableNumber: Number(order.tableNumber),
      paymentMethodId: order.paymentMethodId,
      razorpayOrderId: razorpayOrder.id
    });

    return res.json(buildCreateOrderResponse(order, {
      keyId: credentials.keyId,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      name: process.env.RAZORPAY_CHECKOUT_NAME || "HotelMenu",
      description: `Payment for order ${order._id}`,
      notes
    }));
  } catch (err) {
    return res.status(400).json({ error: err.message || "Unable to create Razorpay order." });
  }
});

customerRouter.post("/verify", async (req, res) => {
  try {
    const orderId = readRequestOrderId(req);
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required" });
    }

    const order = await Order.findById(orderId);
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
      return res.json({
        orderId: String(order._id),
        paymentStatus: PAYMENT_STATUS.SUCCESS,
        transactionId: String(order.transactionId || ""),
        paidAt: order.paidAt,
        ...buildPaymentReceiptPayload(order),
        message: "Payment already completed."
      });
    }

    const paymentSettings = await getOrCreatePaymentSettings(order.restaurantId);
    const settingsMethods = Array.isArray(paymentSettings.enabledMethods) ? paymentSettings.enabledMethods : [];
    const requestedMethodId = readRequestedMethodId(req) || String(order.paymentMethodId || "").trim();

    let method = requestedMethodId
      ? settingsMethods.find(item => String(item?.methodId || "") === requestedMethodId)
      : null;

    if (!method || !isRazorpayProvider(method.providerName)) {
      method = settingsMethods.find(item => isRazorpayProvider(item?.providerName || ""));
    }

    if (!method && isRazorpayProvider(order.paymentProvider || order.paymentMethod)) {
      method = {
        methodId: String(order.paymentMethodId || "razorpay"),
        providerName: "RAZORPAY",
        displayName: "Razorpay",
        type: "ONLINE"
      };
    }

    if (!method || !isRazorpayProvider(method.providerName)) {
      return res.status(400).json({
        error: "Razorpay payment method is not available for verification."
      });
    }

    const credentialsFromMethod = getMethodCredentials(method, paymentSettings);
    const credentials = getRazorpayCredentials(credentialsFromMethod);

    const requestedStatus = String(req.body.status || "").trim().toUpperCase();
    const razorpayOrderId = String(req.body.razorpay_order_id || "").trim();
    const razorpayPaymentId = String(req.body.razorpay_payment_id || "").trim();
    const razorpaySignature = String(req.body.razorpay_signature || "").trim();

    const storedRazorpayOrderId = getExistingRazorpayOrderId(order);
    if (storedRazorpayOrderId && razorpayOrderId && storedRazorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ error: "Razorpay order mismatch for this payment attempt." });
    }

    const previousStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    order.paymentMethodId = method.methodId;
    order.paymentMethod = normalizePaymentMethodCode(method.providerName || method.displayName || "RAZORPAY");
    order.paymentProvider = "RAZORPAY";
    order.paymentType = "ONLINE";
    order.paymentRequestedAt = order.paymentRequestedAt || new Date();
    order.paymentAttemptId = order.paymentAttemptId || createPaymentAttemptId();
    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));

    if (requestedStatus === "FAILED") {
      order.paymentStatus = PAYMENT_STATUS.FAILED;
      order.paidAt = null;
      if (razorpayPaymentId) {
        order.transactionId = razorpayPaymentId;
      }
      order.paymentGatewayResponse = {
        ...(order.paymentGatewayResponse || {}),
        provider: "RAZORPAY",
        razorpayOrderId: razorpayOrderId || storedRazorpayOrderId || "",
        razorpayPaymentId: razorpayPaymentId || "",
        verificationStatus: PAYMENT_STATUS.FAILED,
        verificationMode: "customer-callback",
        failureReason: String(req.body.failureReason || "Payment failed in checkout"),
        verifiedAt: new Date().toISOString()
      };
      upsertPaymentTransaction(order, {
        attemptId: order.paymentAttemptId,
        provider: "RAZORPAY",
        paymentMethodId: method.methodId,
        paymentMethod: order.paymentMethod,
        gatewayOrderId: razorpayOrderId || storedRazorpayOrderId || "",
        gatewayPaymentId: razorpayPaymentId || "",
        amount: Number(order.payableTotal || order.total || 0),
        currency: "INR",
        status: PAYMENT_STATUS.FAILED,
        failureReason: String(req.body.failureReason || "Payment failed in checkout"),
        gatewayResponse: {
          verificationMode: "customer-callback"
        }
      });

      await order.save();
      emitOrderUpdated(buildOrderResponse(order));

      if (previousStatus !== PAYMENT_STATUS.FAILED) {
        await notifyPaymentFailure(order);
      }

      return res.json({
        orderId: String(order._id),
        paymentStatus: order.paymentStatus,
        transactionId: String(order.transactionId || ""),
        paidAt: order.paidAt,
        message: "Payment failed. Please try again."
      });
    }

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return res.status(400).json({
        error: "razorpay_order_id, razorpay_payment_id and razorpay_signature are required for verification."
      });
    }

    const signatureValid = verifyCheckoutSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature: razorpaySignature,
      keySecret: credentials.keySecret
    });

    if (!signatureValid) {
      return res.status(400).json({ error: "Invalid Razorpay payment signature." });
    }

    order.paymentStatus = PAYMENT_STATUS.SUCCESS;
    order.transactionId = razorpayPaymentId;
    order.paidAt = new Date();
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      provider: "RAZORPAY",
      razorpayOrderId: razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId,
      razorpaySignature,
      verificationStatus: PAYMENT_STATUS.SUCCESS,
      verificationMode: "customer-callback",
      verifiedAt: new Date().toISOString()
    };
    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: "RAZORPAY",
      paymentMethodId: method.methodId,
      paymentMethod: order.paymentMethod,
      gatewayOrderId: razorpayOrderId,
      gatewayPaymentId: razorpayPaymentId,
      signature: razorpaySignature,
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: PAYMENT_STATUS.SUCCESS,
      verifiedAt: new Date(),
      gatewayResponse: {
        verificationMode: "customer-callback"
      }
    });

    const receipt = await upsertReceiptForOrder(order);

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    if (previousStatus !== PAYMENT_STATUS.SUCCESS) {
      await notifyPaymentSuccess(order, { receipt });
      await closeBillIfSettled(order);
    }

    return res.json({
      orderId: String(order._id),
      paymentStatus: order.paymentStatus,
      transactionId: String(order.transactionId || ""),
      paidAt: order.paidAt,
      ...buildPaymentReceiptPayload(order, receipt),
      message: "Payment verified successfully."
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Unable to verify Razorpay payment." });
  }
});

webhookRouter.post("/", async (req, res) => {
  try {
    const signature = String(req.headers["x-razorpay-signature"] || "").trim();
    if (!signature) {
      return res.status(401).json({ error: "Missing Razorpay webhook signature." });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body || ""), "utf8");

    let payload = {};
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (_err) {
      return res.status(400).json({ error: "Invalid webhook payload." });
    }

    const webhook = getWebhookEntity(payload);
    console.log("[razorpay-webhook]", webhook);

    let webhookSecret = "";
    if (webhook.restaurantId) {
      try {
        const paymentSettings = await getOrCreatePaymentSettings(webhook.restaurantId);
        const settingsMethods = Array.isArray(paymentSettings.enabledMethods) ? paymentSettings.enabledMethods : [];
        const razorpayMethod = settingsMethods.find(item => isRazorpayProvider(item?.providerName || ""));
        const methodCredentials = razorpayMethod ? getMethodCredentials(razorpayMethod, paymentSettings) : {};
        webhookSecret = getRazorpayCredentials(methodCredentials).webhookSecret || "";
      } catch (_err) {
        webhookSecret = "";
      }
    }

    if (!webhookSecret) {
      webhookSecret = getRazorpayCredentials({}).webhookSecret || "";
    }

    if (!webhookSecret) {
      return res.status(500).json({ error: "Razorpay webhook secret is not configured." });
    }

    const validSignature = verifyWebhookSignature({
      rawBody,
      signature,
      webhookSecret
    });

    if (!validSignature) {
      return res.status(401).json({ error: "Invalid webhook signature." });
    }

    if (!SUPPORTED_WEBHOOK_EVENTS.has(webhook.event)) {
      return res.json({ received: true, ignored: true, reason: "unsupported_event" });
    }

    let order = null;
    if (webhook.orderId) {
      order = await Order.findById(webhook.orderId);
    }

    if (!order && webhook.razorpayOrderId) {
      order = await Order.findOne({ "paymentGatewayResponse.razorpayOrderId": webhook.razorpayOrderId });
    }

    if (!order && webhook.razorpayPaymentId) {
      order = await Order.findOne({ transactionId: webhook.razorpayPaymentId });
    }

    if (!order) {
      return res.json({ received: true, ignored: true, reason: "order_not_found" });
    }

    if (webhook.restaurantId && String(order.restaurantId || "") !== webhook.restaurantId) {
      return res.status(403).json({ error: "Webhook restaurant mismatch." });
    }

    const previousStatus = normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING);
    const successEvent = webhook.event === "payment.captured" || webhook.event === "order.paid";
    const failureEvent = webhook.event === "payment.failed";

    order.paymentProvider = "RAZORPAY";
    order.paymentType = "ONLINE";
    order.paymentMethod = order.paymentMethod || "RAZORPAY";
    order.paymentAttemptId = order.paymentAttemptId || createPaymentAttemptId();
    order.paymentRequestedAt = order.paymentRequestedAt || new Date();
    order.total = Number(computeBillSubtotal(order).toFixed(2));
    order.payableTotal = Number((order.total + Number(order.convenienceFee || 0)).toFixed(2));
    order.paymentGatewayResponse = {
      ...(order.paymentGatewayResponse || {}),
      provider: "RAZORPAY",
      razorpayOrderId: webhook.razorpayOrderId || getExistingRazorpayOrderId(order),
      razorpayPaymentId: webhook.razorpayPaymentId || String(order.transactionId || ""),
      razorpayMethod: webhook.method || String(order.paymentGatewayResponse?.razorpayMethod || ""),
      webhookEvent: webhook.event,
      webhookStatus: webhook.status || "",
      webhookReceivedAt: new Date().toISOString()
    };

    if (successEvent) {
      if (previousStatus !== PAYMENT_STATUS.SUCCESS) {
        order.paymentStatus = PAYMENT_STATUS.SUCCESS;
        order.transactionId = webhook.razorpayPaymentId || String(order.transactionId || "");
        order.paidAt = order.paidAt || new Date();
      }
    } else if (failureEvent) {
      if (previousStatus !== PAYMENT_STATUS.SUCCESS) {
        order.paymentStatus = PAYMENT_STATUS.FAILED;
        order.transactionId = webhook.razorpayPaymentId || String(order.transactionId || "");
        order.paidAt = null;
      }
    }

    upsertPaymentTransaction(order, {
      attemptId: order.paymentAttemptId,
      provider: "RAZORPAY",
      paymentMethodId: order.paymentMethodId,
      paymentMethod: order.paymentMethod,
      gatewayOrderId: webhook.razorpayOrderId || getExistingRazorpayOrderId(order),
      gatewayPaymentId: webhook.razorpayPaymentId || String(order.transactionId || ""),
      amount: Number(order.payableTotal || order.total || 0),
      currency: "INR",
      status: successEvent ? PAYMENT_STATUS.SUCCESS : failureEvent ? PAYMENT_STATUS.FAILED : order.paymentStatus,
      verifiedAt: successEvent ? new Date() : null,
      failureReason: failureEvent ? webhook.status || "payment.failed" : "",
      gatewayResponse: {
        webhookEvent: webhook.event,
        webhookStatus: webhook.status || "",
        razorpayMethod: webhook.method || ""
      }
    });

    let receipt = null;
    if (successEvent) {
      receipt = await upsertReceiptForOrder(order);
    }

    await order.save();
    emitOrderUpdated(buildOrderResponse(order));

    try {
      if (successEvent && previousStatus !== PAYMENT_STATUS.SUCCESS) {
        await notifyPaymentSuccess(order, {
          message: `Payment captured for order ${order._id}.`,
          receipt
        });
        await closeBillIfSettled(order);
      }
      if (failureEvent && previousStatus !== PAYMENT_STATUS.SUCCESS && previousStatus !== PAYMENT_STATUS.FAILED) {
        await notifyPaymentFailure(order, { message: `Payment failed for order ${order._id}.` });
      }
    } catch (_notifyErr) {
      // webhook acknowledgement should not fail because of notifications
    }

    return res.json({
      received: true,
      orderId: String(order._id),
      paymentStatus: normalizePaymentStatus(order.paymentStatus, PAYMENT_STATUS.PENDING)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Unable to process Razorpay webhook." });
  }
});

module.exports = {
  customerRouter,
  webhookRouter
};
