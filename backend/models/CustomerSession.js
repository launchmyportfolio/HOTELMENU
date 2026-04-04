const mongoose = require("mongoose");

const CustomerSessionSchema = new mongoose.Schema({

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
    required: true,
    unique: true
  },

  active: {
    type: Boolean,
    default: true
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  lastActivityAt: {
    type: Date,
    default: Date.now
  },

  endedAt: {
    type: Date
  }

});

CustomerSessionSchema.index({ restaurantId: 1, tableNumber: 1, active: 1 });

module.exports = mongoose.model("CustomerSession", CustomerSessionSchema);
