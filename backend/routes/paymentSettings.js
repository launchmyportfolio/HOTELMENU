const express = require("express");
const Restaurant = require("../models/Restaurant");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const {
  getOrCreatePaymentSettings,
  upsertPaymentSettings,
  togglePaymentMethod,
  deletePaymentMethod,
  buildAdminSafeSettings,
  getMethodCredentials,
  normalizeProviderName
} = require("../services/payments/paymentSettingsService");
const { resolveRazorpayCredentials } = require("../services/payments/razorpayGateway");
const { validateRestaurantRazorpayConfiguration } = require("../services/payments/razorpayConfigService");

const router = express.Router();

function ensureOwnerRestaurantAccess(req, res) {
  const targetRestaurantId = String(req.params.restaurantId || "").trim();
  if (!targetRestaurantId) {
    res.status(400).json({ error: "restaurantId is required" });
    return null;
  }

  if (String(req.owner?.restaurantId || "") !== targetRestaurantId) {
    res.status(403).json({ error: "You can only manage your own restaurant payment settings" });
    return null;
  }

  return targetRestaurantId;
}

router.get("/:restaurantId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await getOrCreatePaymentSettings(restaurantId);
    return res.json(buildAdminSafeSettings(settings));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/:restaurantId/razorpay-diagnostics", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await getOrCreatePaymentSettings(restaurantId);
    const restaurant = await Restaurant.findById(restaurantId)
      .select("paymentModeEnabled paymentConfigurationStatus paymentConfigurationMessage paymentConfigurationValidatedAt")
      .lean();
    const enabledMethods = Array.isArray(settings.enabledMethods) ? settings.enabledMethods : [];
    const razorpayMethod = enabledMethods.find(method => normalizeProviderName(method?.providerName || "") === "RAZORPAY");
    const methodCredentials = razorpayMethod ? getMethodCredentials(razorpayMethod, settings) : {};
    const diagnostics = resolveRazorpayCredentials(methodCredentials, {
      runtimeEnvironment: process.env.NODE_ENV || ""
    });

    return res.json({
      restaurantId,
      configuredMethodId: String(razorpayMethod?.methodId || ""),
      configuredMethodName: String(razorpayMethod?.displayName || "Razorpay"),
      enabled: Boolean(razorpayMethod?.enabled),
      type: String(razorpayMethod?.type || "ONLINE"),
      accountName: diagnostics.accountName || "",
      status: String(restaurant?.paymentConfigurationStatus || "NOT_VALIDATED"),
      message: String(restaurant?.paymentConfigurationMessage || ""),
      paymentModeEnabled: restaurant?.paymentModeEnabled !== false,
      validatedAt: restaurant?.paymentConfigurationValidatedAt || null,
      mode: diagnostics.mode,
      credentialSource: diagnostics.credentialSource,
      keyIdPreview: diagnostics.keyIdPreview,
      hasKeyId: diagnostics.hasKeyId,
      hasKeySecret: diagnostics.hasKeySecret,
      hasWebhookSecret: diagnostics.hasWebhookSecret,
      webhookSecretSource: diagnostics.webhookSecretSource,
      missingFields: diagnostics.missingFields,
      warnings: diagnostics.warnings
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:restaurantId/razorpay-validate", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const result = await validateRestaurantRazorpayConfiguration(restaurantId, { persist: true });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post("/:restaurantId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await upsertPaymentSettings(restaurantId, req.body || {});
    const razorpayValidation = await validateRestaurantRazorpayConfiguration(restaurantId, { persist: true });
    return res.status(201).json({
      ...buildAdminSafeSettings(settings),
      razorpayValidation
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put("/:restaurantId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await upsertPaymentSettings(restaurantId, req.body || {});
    const razorpayValidation = await validateRestaurantRazorpayConfiguration(restaurantId, { persist: true });
    return res.json({
      ...buildAdminSafeSettings(settings),
      razorpayValidation
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/:restaurantId/method/:methodId/toggle", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const methodId = String(req.params.methodId || "").trim();
    const settings = await togglePaymentMethod(restaurantId, methodId, req.body?.enabled);
    return res.json(buildAdminSafeSettings(settings));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/:restaurantId/method/:methodId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const methodId = String(req.params.methodId || "").trim();
    const settings = await deletePaymentMethod(restaurantId, methodId);
    return res.json(buildAdminSafeSettings(settings));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;
