const mongoose = require("mongoose");

const NOTIFICATION_TYPES = [
  "NEW_ORDER",
  "ORDER_ACCEPTED",
  "ORDER_REJECTED",
  "ORDER_PREPARING",
  "ORDER_READY",
  "ORDER_SERVED",
  "PAYMENT_SUCCESS",
  "PAYMENT_FAILED",
  "TABLE_OCCUPIED",
  "TABLE_AVAILABLE",
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "WAITER_CALLED",
  "SYSTEM_ALERT"
];

const NOTIFICATION_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const TARGET_ROLES = ["ADMIN", "KITCHEN", "STAFF", "CUSTOMER"];

const NotificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },

    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      default: "SYSTEM_ALERT"
    },

    priority: {
      type: String,
      enum: NOTIFICATION_PRIORITIES,
      default: "LOW"
    },

    targetRole: {
      type: String,
      enum: TARGET_ROLES,
      required: true,
      index: true
    },

    tableNumber: {
      type: Number,
      required: false
    },

    tableId: {
      type: String,
      required: false,
      index: true
    },

    orderId: {
      type: String,
      required: false,
      index: true
    },

    bookingId: {
      type: String,
      required: false,
      index: true
    },

    uniqueKey: {
      type: String,
      required: false,
      index: true
    },

    redirectUrl: {
      type: String,
      required: false,
      default: ""
    },

    sessionId: {
      type: String,
      required: false,
      index: true
    },

    restaurantId: {
      type: String,
      required: true,
      index: true,
      default: process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant"
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true
    },

    readAt: {
      type: Date,
      default: null
    },

    soundEnabled: {
      type: Boolean,
      default: true
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

NotificationSchema.index({ restaurantId: 1, targetRole: 1, isRead: 1, updatedAt: -1 });
NotificationSchema.index({ restaurantId: 1, tableNumber: 1, targetRole: 1, updatedAt: -1 });
NotificationSchema.index({ restaurantId: 1, targetRole: 1, uniqueKey: 1 });
NotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

const Notification = mongoose.model("Notification", NotificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.NOTIFICATION_PRIORITIES = NOTIFICATION_PRIORITIES;
module.exports.TARGET_ROLES = TARGET_ROLES;
