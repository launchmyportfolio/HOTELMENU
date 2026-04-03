const mongoose = require("mongoose");

const ReceiptItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      default: "General",
      trim: true
    },
    qty: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      default: "Served"
    },
    orderedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

const BillReceiptSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true
    },
    restaurantId: {
      type: String,
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      default: "",
      index: true
    },
    tableNumber: {
      type: Number,
      required: true
    },
    billNumber: {
      type: String,
      default: ""
    },
    receiptNumber: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    shareToken: {
      type: String,
      required: true,
      index: true
    },
    currency: {
      type: String,
      default: "INR"
    },
    restaurantSnapshot: {
      name: {
        type: String,
        default: ""
      },
      address: {
        type: String,
        default: ""
      },
      logoUrl: {
        type: String,
        default: ""
      }
    },
    customerSnapshot: {
      customerName: {
        type: String,
        default: ""
      },
      phoneNumber: {
        type: String,
        default: ""
      }
    },
    items: {
      type: [ReceiptItemSchema],
      default: []
    },
    subtotal: {
      type: Number,
      default: 0
    },
    taxAmount: {
      type: Number,
      default: 0
    },
    gstAmount: {
      type: Number,
      default: 0
    },
    convenienceFee: {
      type: Number,
      default: 0
    },
    finalAmount: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      default: "PAID"
    },
    paymentMethod: {
      type: String,
      default: ""
    },
    paymentProvider: {
      type: String,
      default: ""
    },
    paymentAttemptId: {
      type: String,
      default: ""
    },
    transactionId: {
      type: String,
      default: ""
    },
    razorpayOrderId: {
      type: String,
      default: ""
    },
    razorpayPaymentId: {
      type: String,
      default: ""
    },
    signature: {
      type: String,
      default: ""
    },
    paidAt: {
      type: Date,
      default: null
    },
    generatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

BillReceiptSchema.index({ restaurantId: 1, createdAt: -1 });
BillReceiptSchema.index({ restaurantId: 1, tableNumber: 1, createdAt: -1 });

module.exports = mongoose.model("BillReceipt", BillReceiptSchema);
