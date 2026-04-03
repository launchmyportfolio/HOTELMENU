const crypto = require("crypto");

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function getRazorpayCredentials(credentials = {}) {
  const keyId = normalizeText(
    process.env.RAZORPAY_KEY_ID
    || credentials.keyId
    || credentials.key_id
    || credentials.apiKey
  );
  const keySecret = normalizeText(
    process.env.RAZORPAY_KEY_SECRET
    || credentials.keySecret
    || credentials.key_secret
    || credentials.apiSecret
  );
  const webhookSecret = normalizeText(
    process.env.RAZORPAY_WEBHOOK_SECRET
    || credentials.webhookSecret
    || credentials.webhook_secret
  );

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }

  return { keyId, keySecret, webhookSecret };
}

function toPositiveInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number);
}

function toPaise(amountRupees, fallback = 0) {
  const number = Number(amountRupees);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.round(number * 100);
}

function createBasicAuthHeader(keyId, keySecret) {
  const token = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function parseErrorMessage(payload = {}, responseStatus = 500) {
  const errorObj = payload?.error && typeof payload.error === "object" ? payload.error : null;
  const message = normalizeText(
    errorObj?.description
    || errorObj?.reason
    || payload?.message
    || payload?.description
  );

  if (message) return message;
  return `Razorpay request failed with status ${responseStatus}`;
}

async function razorpayRequest(path, options = {}) {
  const credentials = getRazorpayCredentials(options.credentials || {});
  const method = String(options.method || "GET").trim().toUpperCase();
  const headers = {
    Authorization: createBasicAuthHeader(credentials.keyId, credentials.keySecret),
    "Content-Type": "application/json"
  };

  const response = await fetch(`${RAZORPAY_API_BASE_URL}${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (_err) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, response.status));
  }

  return payload || {};
}

async function createRazorpayOrder(payload = {}) {
  const credentials = getRazorpayCredentials(payload.credentials || {});
  const amount = toPositiveInteger(payload.amountPaise, 0);
  const currency = normalizeText(payload.currency || "INR").toUpperCase() || "INR";
  const receipt = normalizeText(payload.receipt || "");
  const notes = payload.notes && typeof payload.notes === "object" ? payload.notes : {};

  if (!amount) {
    throw new Error("Order amount must be greater than 0.");
  }

  const requestBody = {
    amount,
    currency,
    receipt: receipt.slice(0, 40),
    notes
  };

  const order = await razorpayRequest("/orders", {
    method: "POST",
    body: requestBody,
    credentials
  });

  return {
    id: normalizeText(order.id),
    amount: toPositiveInteger(order.amount, amount),
    currency: normalizeText(order.currency || currency).toUpperCase() || "INR",
    status: normalizeText(order.status || "created"),
    receipt: normalizeText(order.receipt || requestBody.receipt),
    notes: order.notes && typeof order.notes === "object" ? order.notes : notes
  };
}

function safeTimingCompare(a = "", b = "") {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function verifyCheckoutSignature(payload = {}) {
  const orderId = normalizeText(payload.orderId || payload.razorpayOrderId || payload.razorpay_order_id);
  const paymentId = normalizeText(payload.paymentId || payload.razorpayPaymentId || payload.razorpay_payment_id);
  const signature = normalizeText(payload.signature || payload.razorpaySignature || payload.razorpay_signature);
  const keySecret = normalizeText(payload.keySecret);

  if (!orderId || !paymentId || !signature || !keySecret) return false;

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return safeTimingCompare(expectedSignature, signature);
}

function verifyWebhookSignature(payload = {}) {
  const signature = normalizeText(payload.signature);
  const webhookSecret = normalizeText(payload.webhookSecret);
  if (!signature || !webhookSecret) return false;

  const bodyBuffer = Buffer.isBuffer(payload.rawBody)
    ? payload.rawBody
    : Buffer.from(String(payload.rawBody || ""), "utf8");

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(bodyBuffer)
    .digest("hex");

  return safeTimingCompare(expectedSignature, signature);
}

module.exports = {
  toPaise,
  getRazorpayCredentials,
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature
};
