const mongoose = require("mongoose");

const TableSchema = new mongoose.Schema({

  tableNumber: {
    type: Number,
    required: true,
    unique: true
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

module.exports = mongoose.model("Table", TableSchema);
