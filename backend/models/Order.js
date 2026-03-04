const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema({

  tableNumber: {
    type: Number,
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