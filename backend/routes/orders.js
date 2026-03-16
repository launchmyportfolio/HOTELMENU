const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const CustomerSession = require("../models/CustomerSession");
const Table = require("../models/Table");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const { ordersLimiter } = require("../middleware/rateLimiters");
const { emitNewOrder } = require("../socketEmitter");

// 1️⃣ Place Order (customer)
router.post("/", ordersLimiter, async (req, res) => {

  try {

    const {
      tableNumber,
      customerName,
      phoneNumber,
      sessionId,
      items,
      total,
      restaurantId: reqRestaurantId
    } = req.body;
    const restaurantId = reqRestaurantId || process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant";

    if (!tableNumber || !customerName || !phoneNumber || !sessionId || !restaurantId) {
      return res.status(400).json({ error: "restaurantId, table number, customer name, phone, and sessionId are required." });
    }

    const activeSession = await CustomerSession.findOne({
      restaurantId,
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
      total,
      restaurantId
    });
    await order.save();

    await Table.findOneAndUpdate(
      { restaurantId, tableNumber: Number(tableNumber) },
      {
        status: "occupied",
        customerName,
        phoneNumber,
        activeSession: true,
        updatedAt: new Date()
      },
      { upsert: true }
    );

    emitNewOrder(order);
    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});


// 2️⃣ Get All Orders (Owner)
router.get("/", verifyOwnerToken, async (req, res) => {

  try {

    const orders = await Order.find({ restaurantId: req.owner.restaurantId }).sort({ createdAt: -1 });

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
router.patch("/:id", verifyOwnerToken, async (req, res) => {

  try {

    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, restaurantId: req.owner.restaurantId },
      { status: req.body.status },
      { new: true }
    );

    if (order && req.body.status === "Completed") {
      await CustomerSession.findOneAndUpdate(
        { restaurantId: order.restaurantId, tableNumber: order.tableNumber, active: true },
        { active: false, endedAt: new Date() }
      );
      await Table.findOneAndUpdate(
        { restaurantId: order.restaurantId, tableNumber: order.tableNumber },
        {
          status: "free",
          customerName: "",
          phoneNumber: "",
          activeSession: false,
          updatedAt: new Date()
        }
      );
    }

    res.json(order);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

// 4️⃣ Delete Order
router.delete("/:id", verifyOwnerToken, async (req, res) => {

  try {

    await Order.findOneAndDelete({ _id: req.params.id, restaurantId: req.owner.restaurantId });

    res.json({ message: "Order deleted successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

module.exports = router;
