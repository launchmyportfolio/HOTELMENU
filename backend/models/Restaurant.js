const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const APPROVAL_STATUS_VALUES = ["PENDING_APPROVAL", "APPROVED", "REJECTED"];
const RESTAURANT_STATUS_VALUES = ["ACTIVE", "INACTIVE", "SUSPENDED", "EXPIRED"];
const SUBSCRIPTION_STATUS_VALUES = ["PAID", "UNPAID", "PENDING"];
const SUBSCRIPTION_PLAN_VALUES = ["BASIC", "PREMIUM", "ENTERPRISE"];
const PLAN_TYPE_VALUES = ["MONTHLY", "YEARLY"];

const RestaurantSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ownerName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  logoUrl: { type: String, default: "" },
  tokenVersion: { type: Number, default: 0 },
  notificationSoundEnabled: { type: Boolean, default: true },
  approvalStatus: {
    type: String,
    enum: APPROVAL_STATUS_VALUES,
    default: "PENDING_APPROVAL",
    index: true
  },
  restaurantStatus: {
    type: String,
    enum: RESTAURANT_STATUS_VALUES,
    default: "INACTIVE",
    index: true
  },
  subscriptionStatus: {
    type: String,
    enum: SUBSCRIPTION_STATUS_VALUES,
    default: "UNPAID",
    index: true
  },
  subscriptionPlan: {
    type: String,
    enum: SUBSCRIPTION_PLAN_VALUES,
    default: "BASIC"
  },
  planType: {
    type: String,
    enum: PLAN_TYPE_VALUES,
    default: "MONTHLY"
  },
  subscriptionStartDate: {
    type: Date,
    default: null
  },
  subscriptionEndDate: {
    type: Date,
    default: null
  },
  lastPaymentDate: {
    type: Date,
    default: null
  },
  createdByAdmin: {
    type: Boolean,
    default: false
  },
  approvedByAdmin: {
    type: String,
    default: ""
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: ""
  },
  suspendedAt: {
    type: Date,
    default: null
  },
  deactivatedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

RestaurantSchema.pre("save", async function hashPwd() {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

RestaurantSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model("Restaurant", RestaurantSchema);
module.exports.APPROVAL_STATUS_VALUES = APPROVAL_STATUS_VALUES;
module.exports.RESTAURANT_STATUS_VALUES = RESTAURANT_STATUS_VALUES;
module.exports.SUBSCRIPTION_STATUS_VALUES = SUBSCRIPTION_STATUS_VALUES;
module.exports.SUBSCRIPTION_PLAN_VALUES = SUBSCRIPTION_PLAN_VALUES;
module.exports.PLAN_TYPE_VALUES = PLAN_TYPE_VALUES;
