const express = require("express");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const {
  getOrCreatePaymentSettings,
  upsertPaymentSettings,
  togglePaymentMethod,
  deletePaymentMethod,
  buildAdminSafeSettings
} = require("../services/payments/paymentSettingsService");

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

router.post("/:restaurantId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await upsertPaymentSettings(restaurantId, req.body || {});
    return res.status(201).json(buildAdminSafeSettings(settings));
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.put("/:restaurantId", verifyOwnerToken, async (req, res) => {
  try {
    const restaurantId = ensureOwnerRestaurantAccess(req, res);
    if (!restaurantId) return;

    const settings = await upsertPaymentSettings(restaurantId, req.body || {});
    return res.json(buildAdminSafeSettings(settings));
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
