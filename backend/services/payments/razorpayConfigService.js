const Restaurant = require("../../models/Restaurant");
const {
  getOrCreatePaymentSettings,
  getMethodCredentials,
  normalizeProviderName
} = require("./paymentSettingsService");
const {
  resolveRazorpayCredentials,
  validateRazorpayCredentials
} = require("./razorpayGateway");

function findRazorpayMethod(settings = {}) {
  const methods = Array.isArray(settings?.enabledMethods) ? settings.enabledMethods : [];
  return methods.find(method => normalizeProviderName(method?.providerName || "") === "RAZORPAY") || null;
}

async function validateRestaurantRazorpayConfiguration(restaurantId, options = {}) {
  const key = String(restaurantId || "").trim();
  if (!key) {
    throw new Error("restaurantId is required");
  }

  const restaurant = options.restaurant
    || await Restaurant.findById(key);

  if (!restaurant) {
    throw new Error("Restaurant not found");
  }

  const settings = options.settings
    || await getOrCreatePaymentSettings(key);

  const method = findRazorpayMethod(settings);
  const methodEnabled = Boolean(method?.enabled);
  const credentials = method ? getMethodCredentials(method, settings) : {};
  const diagnostics = resolveRazorpayCredentials(credentials, {
    runtimeEnvironment: process.env.NODE_ENV || ""
  });

  let status = "MISSING";
  let message = "Razorpay is not configured for this restaurant.";
  let liveCheck = null;

  if (restaurant.paymentModeEnabled === false) {
    status = "DISABLED";
    message = "Razorpay is disabled by admin for this restaurant.";
  } else if (!method) {
    status = "MISSING";
    message = "No Razorpay payment method has been added yet.";
  } else if (!methodEnabled) {
    status = "DISABLED";
    message = "Razorpay method exists but is currently disabled.";
  } else if (!diagnostics.hasKeyId || !diagnostics.hasKeySecret) {
    status = "INVALID";
    message = "Razorpay key ID and key secret are required.";
  } else {
    try {
      liveCheck = await validateRazorpayCredentials({ credentials });
      status = "VALID";
      message = diagnostics.hasWebhookSecret
        ? "Razorpay credentials validated successfully."
        : "Razorpay keys are valid, but webhook secret is still missing.";
    } catch (err) {
      status = "INVALID";
      message = err.message || "Unable to validate Razorpay credentials.";
    }
  }

  if (options.persist !== false) {
    restaurant.paymentConfigurationStatus = status;
    restaurant.paymentConfigurationMessage = message;
    restaurant.paymentConfigurationValidatedAt = new Date();
    await restaurant.save();
  }

  return {
    restaurantId: key,
    paymentModeEnabled: restaurant.paymentModeEnabled !== false,
    status,
    message,
    configured: Boolean(method),
    enabled: methodEnabled,
    methodId: String(method?.methodId || ""),
    displayName: String(method?.displayName || "Razorpay"),
    accountName: String(diagnostics.accountName || ""),
    keyIdPreview: diagnostics.keyIdPreview,
    mode: diagnostics.mode,
    hasKeyId: diagnostics.hasKeyId,
    hasKeySecret: diagnostics.hasKeySecret,
    hasWebhookSecret: diagnostics.hasWebhookSecret,
    warnings: diagnostics.warnings || [],
    missingFields: diagnostics.missingFields || [],
    liveCheck
  };
}

module.exports = {
  findRazorpayMethod,
  validateRestaurantRazorpayConfiguration
};
