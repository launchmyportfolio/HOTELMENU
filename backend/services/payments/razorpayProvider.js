function ensureCredentials(credentials = {}) {
  if (!credentials.keyId || !credentials.keySecret) {
    throw new Error("Razorpay credentials are incomplete for this restaurant");
  }
}

function createPayment({ method, order, credentials = {} }) {
  ensureCredentials(credentials);
  const providerOrderId = `rzp_order_${Date.now()}_${Math.floor(Math.random() * 100000)}`;

  return {
    provider: "RAZORPAY",
    paymentStatus: "PENDING",
    transactionId: providerOrderId,
    gatewayResponse: {
      providerOrderId,
      amount: Number(order?.payableTotal || order?.total || 0),
      currency: "INR",
      keyId: credentials.keyId,
      note: "Razorpay order initialized. Complete payment at checkout."
    }
  };
}

function verifyPayment(paymentData = {}, credentials = {}) {
  ensureCredentials(credentials);
  const status = String(paymentData.status || "").toUpperCase();
  const transactionId = String(paymentData.transactionId || paymentData.razorpayPaymentId || "").trim();

  if (status === "FAILED") {
    return {
      valid: false,
      paymentStatus: "FAILED",
      transactionId: transactionId || ""
    };
  }

  if (!transactionId && status === "SUCCESS") {
    return {
      valid: false,
      paymentStatus: "FAILED",
      transactionId: ""
    };
  }

  return {
    valid: true,
    paymentStatus: status === "SUCCESS" ? "SUCCESS" : "PENDING",
    transactionId: transactionId || ""
  };
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
