const mongoose = require("mongoose");

const PAYMENT_STATUS_VALUES = ["PENDING", "INITIATED", "SUCCESS", "FAILED"];
const BILL_STATUS_VALUES = ["OPEN", "CLOSED", "CANCELLED"];
const BILL_ITEM_STATUS_VALUES = ["Pending", "Preparing", "Ready", "Served", "Rejected", "Cancelled"];

const BillItemSchema = new mongoose.Schema(
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
    price: {
      type: Number,
      required: true,
      min: 0
    },
    qty: {
      type: Number,
      required: true,
      min: 1
    },
    lineTotal: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: BILL_ITEM_STATUS_VALUES,
      default: "Pending"
    },
    batchId: {
      type: String,
      default: ""
    },
    orderedAt: {
      type: Date,
      default: Date.now
    },
    preparedAt: {
      type: Date,
      default: null
    },
    readyAt: {
      type: Date,
      default: null
    },
    servedAt: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: ""
    }
  },
  {
    _id: true
  }
);

const PaymentTransactionSchema = new mongoose.Schema(
  {
    attemptId: {
      type: String,
      default: ""
    },
    provider: {
      type: String,
      default: ""
    },
    paymentMethodId: {
      type: String,
      default: ""
    },
    paymentMethod: {
      type: String,
      default: ""
    },
    gatewayOrderId: {
      type: String,
      default: ""
    },
    gatewayPaymentId: {
      type: String,
      default: ""
    },
    signature: {
      type: String,
      default: ""
    },
    amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: "INR"
    },
    status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: "PENDING"
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    failureReason: {
      type: String,
      default: ""
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    _id: true,
    timestamps: true
  }
);

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
      qty: Number,
      category: {
        type: String,
        default: "General"
      },
      status: {
        type: String,
        default: "Pending"
      },
      billItemId: {
        type: String,
        default: ""
      },
      orderedAt: {
        type: Date,
        default: null
      }
    }
  ],

  billItems: {
    type: [BillItemSchema],
    default: []
  },

  billStatus: {
    type: String,
    enum: BILL_STATUS_VALUES,
    default: "OPEN",
    index: true
  },

  billNumber: {
    type: String,
    default: ""
  },

  billClosedAt: {
    type: Date,
    default: null
  },

  lastOrderedAt: {
    type: Date,
    default: Date.now
  },

  total: Number,

  paymentMethodId: {
    type: String,
    default: ""
  },

  paymentMethod: {
    type: String,
    default: ""
  },

  paymentProvider: {
    type: String,
    default: ""
  },

  paymentType: {
    type: String,
    enum: ["ONLINE", "OFFLINE"],
    default: "OFFLINE"
  },

  paymentStatus: {
    type: String,
    enum: PAYMENT_STATUS_VALUES,
    default: "PENDING"
  },

  transactionId: {
    type: String,
    default: ""
  },

  paymentAttemptId: {
    type: String,
    default: ""
  },

  paidAt: {
    type: Date,
    default: null
  },

  paymentRequestedAt: {
    type: Date,
    default: null
  },

  paymentProof: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  convenienceFee: {
    type: Number,
    default: 0
  },

  payableTotal: {
    type: Number,
    default: 0
  },

  paymentInstructions: {
    type: String,
    default: ""
  },

  paymentGatewayResponse: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  paymentTransactions: {
    type: [PaymentTransactionSchema],
    default: []
  },

  receiptId: {
    type: String,
    default: ""
  },

  receiptNumber: {
    type: String,
    default: ""
  },

  receiptShareToken: {
    type: String,
    default: ""
  },

  receiptGeneratedAt: {
    type: Date,
    default: null
  },

  status: {
    type: String,
    default: "Pending"
  },

  createdAt: {
    type: Date,
    default: Date.now
  }

});

OrderSchema.index({ restaurantId: 1, tableNumber: 1, billStatus: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, sessionId: 1, billStatus: 1, createdAt: -1 });
OrderSchema.index({ restaurantId: 1, paymentStatus: 1, paidAt: -1, createdAt: -1 });

module.exports = mongoose.model("Order", OrderSchema);
module.exports.PAYMENT_STATUS_VALUES = PAYMENT_STATUS_VALUES;
module.exports.BILL_STATUS_VALUES = BILL_STATUS_VALUES;
module.exports.BILL_ITEM_STATUS_VALUES = BILL_ITEM_STATUS_VALUES;
