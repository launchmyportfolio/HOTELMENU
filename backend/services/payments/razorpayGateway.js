const crypto = require("crypto");

const RAZORPAY_API_BASE_URL = "https://api.razorpay.com/v1";

function normalizeText(value = "") {
  return String(value || "").trim();
}

function maskValue(value = "", options = {}) {
  const text = normalizeText(value);
  if (!text) return "";

  const visibleStart = Number.isFinite(Number(options.visibleStart)) ? Number(options.visibleStart) : 6;
  const visibleEnd = Number.isFinite(Number(options.visibleEnd)) ? Number(options.visibleEnd) : 4;
  if (text.length <= visibleStart + visibleEnd) {
    return `${text.slice(0, Math.max(1, visibleStart))}${"*".repeat(Math.max(text.length - visibleStart, 1))}`;
  }

  return `${text.slice(0, visibleStart)}${"*".repeat(Math.max(text.length - visibleStart - visibleEnd, 1))}${text.slice(-visibleEnd)}`;
}

function buildCredentialSource(sourceName = "", credentials = {}) {
  return {
    source: sourceName,
    keyId: normalizeText(credentials.keyId || credentials.key_id || credentials.apiKey),
    keySecret: normalizeText(credentials.keySecret || credentials.key_secret || credentials.apiSecret),
    webhookSecret: normalizeText(credentials.webhookSecret || credentials.webhook_secret),
    accountName: normalizeText(credentials.accountName || credentials.account_name)
  };
}

function detectRazorpayMode(keyId = "") {
  const normalized = normalizeText(keyId);
  if (normalized.startsWith("rzp_live_")) return "LIVE";
  if (normalized.startsWith("rzp_test_")) return "TEST";
  return "UNKNOWN";
}

function resolveRazorpayCredentials(credentials = {}, options = {}) {
  const paymentSettingsSource = buildCredentialSource("payment_settings", credentials);
  const selectedSource = paymentSettingsSource.keyId || paymentSettingsSource.keySecret
    ? paymentSettingsSource
    : null;

  const keyId = normalizeText(selectedSource?.keyId);
  const keySecret = normalizeText(selectedSource?.keySecret);
  const webhookSource = normalizeText(selectedSource?.webhookSecret) ? selectedSource : null;
  const webhookSecret = normalizeText(webhookSource?.webhookSecret);
  const accountName = normalizeText(selectedSource?.accountName);
  const mode = detectRazorpayMode(keyId);
  const missingFields = [];

  if (!keyId) missingFields.push("keyId");
  if (!keySecret) missingFields.push("keySecret");

  const warnings = [];
  if (paymentSettingsSource.keyId || paymentSettingsSource.keySecret) {
    if (!(paymentSettingsSource.keyId && paymentSettingsSource.keySecret)) {
      warnings.push("Saved Razorpay credentials are incomplete.");
    }
  }

  if (!webhookSecret) {
    warnings.push("Razorpay webhook secret is missing. Webhook verification will fail until it is configured.");
  }

  if (mode === "TEST" && String(options.runtimeEnvironment || process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    warnings.push("Test Razorpay credentials are active while the server is running in production mode.");
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    accountName,
    mode,
    credentialSource: selectedSource?.source || "missing",
    webhookSecretSource: webhookSource?.source || "missing",
    hasKeyId: Boolean(keyId),
    hasKeySecret: Boolean(keySecret),
    hasWebhookSecret: Boolean(webhookSecret),
    keyIdPreview: maskValue(keyId, { visibleStart: 10, visibleEnd: 4 }),
    missingFields,
    warnings
  };
}

function getRazorpayCredentials(credentials = {}) {
  const resolved = resolveRazorpayCredentials(credentials);

  if (!resolved.keyId || !resolved.keySecret) {
    throw new Error("Razorpay credentials are not configured. Set a complete key_id and key_secret in payment settings or environment variables.");
  }

  return {
    keyId: resolved.keyId,
    keySecret: resolved.keySecret,
    webhookSecret: resolved.webhookSecret,
    accountName: resolved.accountName,
    mode: resolved.mode,
    credentialSource: resolved.credentialSource,
    webhookSecretSource: resolved.webhookSecretSource
  };
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

async function validateRazorpayCredentials(payload = {}) {
  const credentials = getRazorpayCredentials(payload.credentials || {});
  const response = await razorpayRequest("/payments?count=1", {
    method: "GET",
    credentials
  });

  return {
    valid: true,
    mode: credentials.mode,
    accountName: credentials.accountName || "",
    credentialSource: credentials.credentialSource,
    hasItems: Array.isArray(response?.items)
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
  detectRazorpayMode,
  resolveRazorpayCredentials,
  getRazorpayCredentials,
  createRazorpayOrder,
  validateRazorpayCredentials,
  verifyCheckoutSignature,
  verifyWebhookSignature
};
