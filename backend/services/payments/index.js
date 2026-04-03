const cashProvider = require("./cashProvider");
const upiProvider = require("./upiProvider");
const razorpayProvider = require("./razorpayProvider");
const juspayProvider = require("./juspayProvider");
const stripeProvider = require("./stripeProvider");

const PROVIDER_REGISTRY = {
  CASH: cashProvider,
  CARD: cashProvider,
  PAY_LATER: cashProvider,
  PAY_AT_COUNTER: cashProvider,
  UPI: upiProvider,
  RAZORPAY: razorpayProvider,
  JUSPAY: juspayProvider,
  STRIPE: stripeProvider
};

function normalizeProviderName(value = "") {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function getProvider(providerName = "") {
  const key = normalizeProviderName(providerName);
  return PROVIDER_REGISTRY[key] || cashProvider;
}

function createPayment({ method, order, credentials = {} }) {
  const provider = getProvider(method?.providerName);
  return provider.createPayment({ method, order, credentials });
}

function verifyPayment({ method, paymentData, credentials = {} }) {
  const provider = getProvider(method?.providerName);
  return provider.verifyPayment(paymentData || {}, credentials);
}

function refundPayment({ method, refundData, credentials = {} }) {
  const provider = getProvider(method?.providerName);
  return provider.refundPayment(refundData || {}, credentials);
}

module.exports = {
  normalizeProviderName,
  getProvider,
  createPayment,
  verifyPayment,
  refundPayment
};
