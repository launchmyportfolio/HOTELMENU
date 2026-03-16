const express = require("express");
const MenuItem = require("../models/MenuItem");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");

const router = express.Router();

// Get all menu items (public)
router.get("/", async (req, res) => {
  try {
    const restaurantId = req.query.restaurantId || process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";
    const items = await MenuItem.find({ restaurantId }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single menu item (public)
router.get("/:id", async (req, res) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create menu item (admin)
router.post("/", verifyOwnerToken, async (req, res) => {
  try {
    const item = new MenuItem({ ...req.body, restaurantId: req.owner.restaurantId });
    await item.save();
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update menu item (admin)
router.put("/:id", verifyOwnerToken, async (req, res) => {
  try {
    const item = await MenuItem.findByIdAndUpdate(
      { _id: req.params.id, restaurantId: req.owner.restaurantId },
      req.body,
      { new: true, runValidators: true }
    );

    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete menu item (admin)
router.delete("/:id", verifyOwnerToken, async (req, res) => {
  try {
    const item = await MenuItem.findOneAndDelete({ _id: req.params.id, restaurantId: req.owner.restaurantId });
    if (!item) return res.status(404).json({ error: "Item not found" });
    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
