const mongoose = require("mongoose");

const CustomerSessionSchema = new mongoose.Schema({

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

  endedAt: {
    type: Date
  }

});

CustomerSessionSchema.index({ tableNumber: 1, active: 1 });

module.exports = mongoose.model("CustomerSession", CustomerSessionSchema);
