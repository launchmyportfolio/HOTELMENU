const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const CustomerSession = require("../models/CustomerSession");
const isAdmin = require("../middleware/isAdmin");


// 1️⃣ Place Order
router.post("/", async (req, res) => {

  try {

    const {
      tableNumber,
      customerName,
      phoneNumber,
      sessionId,
      items,
      total
    } = req.body;

    if (!tableNumber || !customerName || !phoneNumber || !sessionId) {
      return res.status(400).json({ error: "Table number, customer name, phone, and sessionId are required." });
    }

    const activeSession = await CustomerSession.findOne({
      tableNumber: Number(tableNumber),
      sessionId,
      active: true
    });

    if (!activeSession) {
      return res.status(403).json({ error: "No active session for this table." });
    }

    const order = new Order({
      tableNumber,
      customerName,
      phoneNumber,
      sessionId,
      items,
      total
    });
    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});


// 2️⃣ Get All Orders (Admin)
router.get("/", isAdmin, async (req, res) => {

  try {

    const orders = await Order.find().sort({ createdAt: -1 });

    res.json(orders);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

// 2️⃣b Get single order (public for status tracking)
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// 3️⃣ Update Order Status
router.patch("/:id", isAdmin, async (req, res) => {

  try {

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    if (order && req.body.status === "Completed") {
      await CustomerSession.findOneAndUpdate(
        { tableNumber: order.tableNumber, active: true },
        { active: false, endedAt: new Date() }
      );
    }

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

// 4️⃣ Delete Order
router.delete("/:id", isAdmin, async (req, res) => {

  try {

    await Order.findByIdAndDelete(req.params.id);

    res.json({ message: "Order deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

module.exports = router;
