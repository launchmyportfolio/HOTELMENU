const mongoose = require("mongoose");

const TableSchema = new mongoose.Schema({

  restaurantId: {
    type: String,
    required: true,
    index: true,
    default: process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant"
  },

  tableNumber: {
    type: Number,
    required: true,
    unique: false
  },

  status: {
    type: String,
    enum: ["free", "occupied"],
    default: "free"
  },

  customerName: {
    type: String,
    default: ""
  },

  phoneNumber: {
    type: String,
    default: ""
  },

  activeSession: {
    type: Boolean,
    default: false
  },

  updatedAt: {
    type: Date,
    default: Date.now
  }
});

TableSchema.index({ restaurantId: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model("Table", TableSchema);
