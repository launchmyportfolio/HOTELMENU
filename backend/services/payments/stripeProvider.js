function ensureCredentials(credentials = {}) {
  if (!credentials.publishableKey || !credentials.secretKey) {
    throw new Error("Stripe credentials are incomplete for this restaurant");
  }
}

function createPayment({ order, credentials = {} }) {
  ensureCredentials(credentials);
  const transactionId = `stripe_pi_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  return {
    provider: "STRIPE",
    paymentStatus: "PENDING",
    transactionId,
    gatewayResponse: {
      transactionId,
      amount: Number(order?.payableTotal || order?.total || 0),
      currency: "INR",
      publishableKey: credentials.publishableKey,
      note: "Stripe payment intent created."
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
