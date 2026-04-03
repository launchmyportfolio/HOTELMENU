const express = require("express");

const BillReceipt = require("../models/BillReceipt");

const router = express.Router();

function normalizeToken(value = "") {
  return String(value || "").trim();
}

router.get("/:receiptId", async (req, res) => {
  try {
    const receipt = await BillReceipt.findById(req.params.receiptId).lean();
    if (!receipt) {
      return res.status(404).json({ error: "Receipt not found" });
    }

    const token = normalizeToken(req.query.token);
    if (!token || token !== normalizeToken(receipt.shareToken)) {
      return res.status(403).json({ error: "Receipt access token is invalid." });
    }

    return res.json({
      ...receipt,
      _id: String(receipt._id),
      orderId: String(receipt.orderId || "")
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
