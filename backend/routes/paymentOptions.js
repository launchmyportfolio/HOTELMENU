const express = require("express");
const { getCustomerPaymentOptions } = require("../services/payments/paymentSettingsService");

const router = express.Router();

router.get("/:restaurantId", async (req, res) => {
  try {
    const restaurantId = String(req.params.restaurantId || "").trim();
    if (!restaurantId) return res.status(400).json({ error: "restaurantId is required" });

    console.log("[payment-options] Request received", { restaurantId });

    const options = await getCustomerPaymentOptions(restaurantId);
    console.log("[payment-options] Response payload", {
      restaurantId: options.restaurantId,
      methods: (options.methods || []).map(method => ({
        methodId: method.methodId,
        providerName: method.providerName,
        type: method.type,
        enabled: method.enabled,
        isDefault: method.isDefault
      })),
      defaultMethodId: options.defaultMethodId
    });
    return res.json(options);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
