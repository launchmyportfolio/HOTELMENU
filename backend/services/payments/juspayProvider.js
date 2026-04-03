function ensureCredentials(credentials = {}) {
  if (!credentials.apiKey || !credentials.merchantId) {
    throw new Error("Juspay credentials are incomplete for this restaurant");
  }
}

function createPayment({ order, credentials = {} }) {
  ensureCredentials(credentials);
  const transactionId = `juspay_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  return {
    provider: "JUSPAY",
    paymentStatus: "PENDING",
    transactionId,
    gatewayResponse: {
      transactionId,
      amount: Number(order?.payableTotal || order?.total || 0),
      currency: "INR",
      note: "Juspay payment intent created."
    }
  };
}

function verifyPayment(paymentData = {}, credentials = {}) {
  ensureCredentials(credentials);
  const status = String(paymentData.status || "").toUpperCase();
  const transactionId = String(paymentData.transactionId || "").trim();

  if (status === "FAILED") return { valid: false, paymentStatus: "FAILED", transactionId };
  if (status === "SUCCESS") return { valid: true, paymentStatus: "SUCCESS", transactionId };
  return { valid: true, paymentStatus: "PENDING", transactionId };
}

function refundPayment() {
  return {
    supported: false,
    status: "NOT_IMPLEMENTED"
  };
}

module.exports = {
  createPayment,
  verifyPayment,
  refundPayment
};
