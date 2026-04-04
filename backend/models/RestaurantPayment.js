const mongoose = require("mongoose");

const PAYMENT_STATUS_VALUES = ["PENDING", "INITIATED", "SUCCESS", "FAILED"];

const RestaurantPaymentSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    billId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    paymentAttemptId: {
      type: String,
      default: "",
      index: true,
      trim: true
    },
    method: {
      type: String,
      default: "",
      trim: true
    },
    provider: {
      type: String,
      default: "",
      trim: true
    },
    amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: "INR",
      trim: true
    },
    razorpayPaymentId: {
      type: String,
      default: "",
      index: true,
      trim: true
    },
    razorpayOrderId: {
      type: String,
      default: "",
      index: true,
      trim: true
    },
    razorpaySignature: {
      type: String,
      default: "",
      trim: true
    },
    status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: "PENDING",
      index: true
    },
    webhookEvent: {
      type: String,
      default: "",
      trim: true
    },
    verifiedAt: {
      type: Date,
      default: null
    },
    failureReason: {
      type: String,
      default: "",
      trim: true
    },
    gatewayPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: {
      createdAt: "createdAt",
      updatedAt: "updatedAt"
    }
  }
);

RestaurantPaymentSchema.index({ restaurantId: 1, billId: 1, paymentAttemptId: 1 });
RestaurantPaymentSchema.index({ restaurantId: 1, razorpayOrderId: 1 });
RestaurantPaymentSchema.index({ restaurantId: 1, razorpayPaymentId: 1 });

module.exports = mongoose.model("RestaurantPayment", RestaurantPaymentSchema);
module.exports.PAYMENT_STATUS_VALUES = PAYMENT_STATUS_VALUES;
