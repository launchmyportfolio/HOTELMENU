function createPayment({ method }) {
  return {
    provider: String(method?.providerName || "CASH").toUpperCase(),
    paymentStatus: "PENDING",
    transactionId: "",
    gatewayResponse: {
      mode: "OFFLINE",
      note: "Cash payment to be collected at restaurant."
    }
  };
}

function verifyPayment() {
  return {
    valid: true,
    paymentStatus: "PENDING"
  };
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
