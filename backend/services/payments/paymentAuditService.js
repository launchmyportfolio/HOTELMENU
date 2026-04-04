const RestaurantPayment = require("../../models/RestaurantPayment");

function normalizeText(value = "") {
  return String(value || "").trim();
}

function normalizeStatus(value = "PENDING") {
  const normalized = normalizeText(value).toUpperCase();
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(normalized)) {
    return normalized;
  }
  return "PENDING";
}

function toPositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildPaymentMatch(order = {}, payload = {}) {
  const restaurantId = normalizeText(payload.restaurantId || order.restaurantId);
  const billId = normalizeText(payload.billId || order._id);
  const paymentAttemptId = normalizeText(payload.paymentAttemptId || order.paymentAttemptId);
  const razorpayPaymentId = normalizeText(payload.razorpayPaymentId || payload.gatewayPaymentId);
  const razorpayOrderId = normalizeText(
    payload.razorpayOrderId
    || payload.gatewayOrderId
    || order?.paymentGatewayResponse?.razorpayOrderId
  );

  if (restaurantId && razorpayPaymentId) {
    return { restaurantId, razorpayPaymentId };
  }

  if (restaurantId && razorpayOrderId) {
    return { restaurantId, razorpayOrderId };
  }

  return {
    restaurantId,
    billId,
    paymentAttemptId
  };
}

async function upsertRestaurantPayment(order = {}, payload = {}) {
  const restaurantId = normalizeText(payload.restaurantId || order.restaurantId);
  const billId = normalizeText(payload.billId || order._id);
  if (!restaurantId || !billId) {
    return null;
  }

  const update = {
    restaurantId,
    billId,
    paymentAttemptId: normalizeText(payload.paymentAttemptId || order.paymentAttemptId),
    method: normalizeText(payload.method || order.paymentMethod),
    provider: normalizeText(payload.provider || order.paymentProvider || "RAZORPAY"),
    amount: toPositiveNumber(payload.amount, toPositiveNumber(order.payableTotal, toPositiveNumber(order.total, 0))),
    currency: normalizeText(payload.currency || order?.paymentGatewayResponse?.razorpayCurrency || "INR") || "INR",
    razorpayPaymentId: normalizeText(payload.razorpayPaymentId || payload.gatewayPaymentId || order.transactionId),
    razorpayOrderId: normalizeText(
      payload.razorpayOrderId
      || payload.gatewayOrderId
      || order?.paymentGatewayResponse?.razorpayOrderId
    ),
    razorpaySignature: normalizeText(payload.razorpaySignature || payload.signature),
    status: normalizeStatus(payload.status || order.paymentStatus),
    webhookEvent: normalizeText(payload.webhookEvent),
    verifiedAt: payload.verifiedAt || null,
    failureReason: normalizeText(payload.failureReason),
    gatewayPayload: payload.gatewayPayload && typeof payload.gatewayPayload === "object"
      ? payload.gatewayPayload
      : {}
  };

  const query = buildPaymentMatch(order, update);

  return RestaurantPayment.findOneAndUpdate(
    query,
    { $set: update },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  );
}

module.exports = {
  upsertRestaurantPayment
};
