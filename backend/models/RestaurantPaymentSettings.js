const mongoose = require("mongoose");

const METHOD_TYPES = ["ONLINE", "OFFLINE"];

const PaymentMethodSchema = new mongoose.Schema(
  {
    methodId: {
      type: String,
      required: true,
      trim: true
    },
    providerName: {
      type: String,
      required: true,
      trim: true
    },
    displayName: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      enum: METHOD_TYPES,
      default: "OFFLINE"
    },
    enabled: {
      type: Boolean,
      default: true
    },
    isDefault: {
      type: Boolean,
      default: false
    },
    credentialsEncrypted: {
      type: String,
      default: ""
    },
    credentialHints: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    upiId: {
      type: String,
      default: ""
    },
    qrImageUrl: {
      type: String,
      default: ""
    },
    instructions: {
      type: String,
      default: ""
    },
    sortOrder: {
      type: Number,
      default: 0
    }
  },
  {
    _id: false
  }
);

const RestaurantPaymentSettingsSchema = new mongoose.Schema(
  {
    restaurantId: {
      type: String,
      required: true,
      unique: true
    },
    enabledMethods: {
      type: [PaymentMethodSchema],
      default: []
    },
    allowCOD: {
      type: Boolean,
      default: true
    },
    allowPayAtCounter: {
      type: Boolean,
      default: true
    },
    minimumOnlineAmount: {
      type: Number,
      default: 0
    },
    convenienceFee: {
      type: Number,
      default: 0
    },
    paymentInstructions: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("RestaurantPaymentSettings", RestaurantPaymentSettingsSchema);
module.exports.METHOD_TYPES = METHOD_TYPES;
