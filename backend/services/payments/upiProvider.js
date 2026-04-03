function createPayment({ method, order }) {
  const reference = `UPI_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  return {
    provider: "UPI",
    paymentStatus: "PENDING",
    transactionId: reference,
    gatewayResponse: {
      upiId: method?.upiId || "",
      qrImageUrl: method?.qrImageUrl || "",
      instructions: method?.instructions || "Complete UPI payment and show confirmation to staff.",
      payableAmount: Number(order?.payableTotal || order?.total || 0)
    }
  };
}

function verifyPayment(paymentData = {}) {
  const status = String(paymentData.status || "").toUpperCase();
  if (status === "SUCCESS") {
    return { valid: true, paymentStatus: "SUCCESS" };
  }
  if (status === "FAILED") {
    return { valid: false, paymentStatus: "FAILED" };
  }
  return { valid: true, paymentStatus: "PENDING" };
}

function refundPayment() {
  return {
    supported: false,
    status: "NOT_SUPPORTED"
  };
}

module.exports = {
  createPayment,
  verifyPayment,
  refundPayment
};
