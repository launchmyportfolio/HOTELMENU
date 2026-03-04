const express = require("express");
const router = express.Router();
const Order = require("../models/Order");


// 1️⃣ Place Order
router.post("/", async (req, res) => {

  try {

    const order = new Order(req.body);
    await order.save();

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});


// 2️⃣ Get All Orders (Admin)
router.get("/", async (req, res) => {

  try {

    const orders = await Order.find().sort({ createdAt: -1 });

    res.json(orders);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});


// 3️⃣ Update Order Status
router.patch("/:id", async (req, res) => {

  try {

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

// 4️⃣ Delete Order
router.delete("/:id", async (req, res) => {

  try {

    await Order.findByIdAndDelete(req.params.id);

    res.json({ message: "Order deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

module.exports = router;