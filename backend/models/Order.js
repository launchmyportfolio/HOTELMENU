const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({

  restaurantId: {
    type: String,
    required: true,
    index: true,
    default: process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant"
  },

  tableNumber: {
    type: Number,
    required: true
  },

  customerName: {
    type: String,
    required: true,
    trim: true
  },

  phoneNumber: {
    type: String,
    required: true,
    trim: true
  },

  sessionId: {
    type: String,
    required: true
  },

  items: [
    {
      name: String,
      price: Number,
      qty: Number
    }
  ],

  total: Number,

  status: {
    type: String,
    default: "Pending"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

module.exports = mongoose.model("Order", OrderSchema);
