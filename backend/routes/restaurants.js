const express = require("express");
const jwt = require("jsonwebtoken");
const Restaurant = require("../models/Restaurant");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");

const router = express.Router();
const JWT_SECRET = process.env.OWNER_JWT_SECRET || "restaurant-secret";

function buildOwnerToken(restaurant) {
  return jwt.sign(
    {
      restaurantId: restaurant.id,
      ownerId: restaurant.id,
      tokenVersion: Number(restaurant.tokenVersion || 0)
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function sanitizeText(value, max = 180) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeOptionalEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 900000) {
    throw new Error("Logo image is too large. Please upload a smaller image.");
  }
  return raw;
}

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

    const token = buildOwnerToken(restaurant);

    res.status(201).json({
      token,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email,
        phone: restaurant.phone,
        address: restaurant.address,
        logoUrl: restaurant.logoUrl || ""
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

    const token = buildOwnerToken(restaurant);

    res.json({
      token,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email,
        phone: restaurant.phone,
        address: restaurant.address,
        logoUrl: restaurant.logoUrl || ""
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/owner/profile", verifyOwnerToken, async (req, res) => {
  const restaurant = req.owner.restaurant;
  return res.json({
    id: restaurant.id,
    name: restaurant.name,
    ownerName: restaurant.ownerName,
    email: restaurant.email,
    phone: restaurant.phone || "",
    address: restaurant.address || "",
    logoUrl: restaurant.logoUrl || ""
  });
});

router.patch("/owner/profile", verifyOwnerToken, async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.owner.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const nextEmail = sanitizeOptionalEmail(req.body.email || restaurant.email);
    if (!nextEmail) {
      return res.status(400).json({ error: "Email is required." });
    }

    const emailConflict = await Restaurant.findOne({
      _id: { $ne: restaurant._id },
      email: nextEmail
    }).select("_id");
    if (emailConflict) {
      return res.status(409).json({ error: "Email is already registered with another restaurant." });
    }

    restaurant.name = sanitizeText(req.body.name || restaurant.name, 120) || restaurant.name;
    restaurant.ownerName = sanitizeText(req.body.ownerName || restaurant.ownerName, 120) || restaurant.ownerName;
    restaurant.email = nextEmail;
    restaurant.phone = sanitizeText(req.body.phone || "", 32);
    restaurant.address = sanitizeText(req.body.address || "", 280);
    restaurant.logoUrl = sanitizeImage(req.body.logoUrl ?? restaurant.logoUrl);
    await restaurant.save();

    return res.json({
      message: "Restaurant settings updated successfully.",
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email,
        phone: restaurant.phone || "",
        address: restaurant.address || "",
        logoUrl: restaurant.logoUrl || ""
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Unable to update restaurant profile." });
  }
});

router.post("/owner/change-password", verifyOwnerToken, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword || String(newPassword).trim().length < 8) {
      return res.status(400).json({ error: "Old password and a new password of at least 8 characters are required." });
    }

    const restaurant = await Restaurant.findById(req.owner.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    const valid = await restaurant.comparePassword(String(oldPassword));
    if (!valid) {
      return res.status(401).json({ error: "Old password is incorrect." });
    }

    restaurant.password = String(newPassword);
    restaurant.tokenVersion = Number(restaurant.tokenVersion || 0) + 1;
    await restaurant.save();

    const token = buildOwnerToken(restaurant);
    return res.json({
      message: "Password updated successfully.",
      token,
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        ownerName: restaurant.ownerName,
        email: restaurant.email,
        phone: restaurant.phone || "",
        address: restaurant.address || "",
        logoUrl: restaurant.logoUrl || ""
      }
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "Unable to change password." });
  }
});

router.post("/owner/logout-all", verifyOwnerToken, async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.owner.restaurantId,
      {
        $inc: { tokenVersion: 1 }
      },
      { new: true }
    );

    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.json({
      message: "All active owner sessions have been logged out."
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unable to logout from all devices." });
  }
});

// Fetch restaurant public details by id
router.get("/:restaurantId", async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId).lean();
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    return res.json({
      _id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address || "",
      logoUrl: restaurant.logoUrl || "",
      phone: restaurant.phone || ""
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
