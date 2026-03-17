const express = require("express");
const jwt = require("jsonwebtoken");
const Restaurant = require("../models/Restaurant");

const router = express.Router();
const JWT_SECRET = process.env.OWNER_JWT_SECRET || "restaurant-secret";

// Register new restaurant owner
router.post("/register", async (req, res) => {
  try {
    const { name, ownerName, email, password, phone, address } = req.body;
    if (!name || !ownerName || !email || !password) {
      return res.status(400).json({ error: "name, ownerName, email, and password are required" });
    }

    const exists = await Restaurant.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const restaurant = new Restaurant({ name, ownerName, email, password, phone, address });
    await restaurant.save();

    const token = jwt.sign({ restaurantId: restaurant.id, ownerId: restaurant.id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      token,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login restaurant owner
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const restaurant = await Restaurant.findOne({ email });
    if (!restaurant) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await restaurant.comparePassword(password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ restaurantId: restaurant.id, ownerId: restaurant.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch restaurant public details by id
router.get("/:restaurantId", async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.json({ _id: restaurant._id, name: restaurant.name });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
