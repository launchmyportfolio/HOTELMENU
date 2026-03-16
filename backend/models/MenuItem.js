const mongoose = require("mongoose");

const MenuItemSchema = new mongoose.Schema(
  {
    restaurantId: { type: String, required: true, index: true, default: process.env.DEFAULT_RESTAURANT_ID || "defaultRestaurant" },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, default: "General" },
    image: { type: String, default: "" },
    available: { type: Boolean, default: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model("MenuItem", MenuItemSchema);
