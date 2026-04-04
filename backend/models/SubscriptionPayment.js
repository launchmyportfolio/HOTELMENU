const mongoose = require("mongoose");

const PAYMENT_STATUS_VALUES = ["PAID", "UNPAID", "PENDING", "FAILED"];
const PLAN_VALUES = ["BASIC", "PREMIUM", "ENTERPRISE"];
const PLAN_TYPE_VALUES = ["MONTHLY", "YEARLY"];

const SubscriptionPaymentSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true
    },
    subscriptionPlan: {
      type: String,
      enum: PLAN_VALUES,
      default: "BASIC"
    },
    planType: {
      type: String,
      enum: PLAN_TYPE_VALUES,
      default: "MONTHLY"
    },
    amount: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: "PENDING",
      index: true
    },
    paymentDate: {
      type: Date,
      default: null
    },
    periodStartDate: {
      type: Date,
      default: null
    },
    periodEndDate: {
      type: Date,
      default: null
    },
    notes: {
      type: String,
      default: ""
    },
    markedByAdmin: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("SubscriptionPayment", SubscriptionPaymentSchema);
module.exports.PAYMENT_STATUS_VALUES = PAYMENT_STATUS_VALUES;
