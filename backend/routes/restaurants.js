const express = require("express");
const jwt = require("jsonwebtoken");
const Restaurant = require("../models/Restaurant");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");
const {
  APPROVAL_STATUS,
  RESTAURANT_STATUS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PLAN_TYPE,
  buildRestaurantAccessState,
  syncRestaurantLifecycle
} = require("../services/restaurantAccessService");

const router = express.Router();
const JWT_SECRET = process.env.OWNER_JWT_SECRET || "restaurant-secret";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "supersecureadmintoken";

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

function requestHasAdminToken(req) {
  const headerToken = req.headers.authorization || req.headers["x-admin-token"];
  const token = headerToken?.startsWith("Bearer ") ? headerToken.slice(7) : headerToken;
  return token === ADMIN_TOKEN;
}

function buildOwnerRestaurantPayload(restaurant) {
  const access = buildRestaurantAccessState(restaurant);
  return {
    id: restaurant.id,
    name: restaurant.name,
    ownerName: restaurant.ownerName,
    email: restaurant.email,
    phone: restaurant.phone,
    address: restaurant.address,
    logoUrl: restaurant.logoUrl || "",
    approvalStatus: access.approvalStatus,
    restaurantStatus: access.restaurantStatus,
    effectiveStatus: access.effectiveStatus,
    subscriptionStatus: access.subscriptionStatus,
    subscriptionPlan: access.subscriptionPlan,
    planType: access.planType,
    subscriptionStartDate: access.subscriptionStartDate,
    subscriptionEndDate: access.subscriptionEndDate,
    lastPaymentDate: access.lastPaymentDate,
    canAcceptNewOrders: access.canAcceptNewOrders
  };
}

// Register new restaurant owner
router.post("/register", async (req, res) => {
  try {
    const { name, ownerName, password, phone, address } = req.body;
    const email = sanitizeOptionalEmail(req.body.email);
    if (!name || !ownerName || !email || !password) {
      return res.status(400).json({ error: "name, ownerName, email, and password are required" });
    }

    const exists = await Restaurant.findOne({ email });
    if (exists) return res.status(409).json({ error: "Email already registered" });

    const createdByAdmin = requestHasAdminToken(req);
    const restaurant = new Restaurant({
      name,
      ownerName,
      email,
      password,
      phone,
      address,
      approvalStatus: APPROVAL_STATUS.PENDING_APPROVAL,
      restaurantStatus: RESTAURANT_STATUS.INACTIVE,
      subscriptionStatus: SUBSCRIPTION_STATUS.UNPAID,
      subscriptionPlan: SUBSCRIPTION_PLAN.BASIC,
      planType: PLAN_TYPE.MONTHLY,
      createdByAdmin
    });
    await restaurant.save();

    res.status(201).json({
      message: "Registration submitted successfully. Your restaurant is pending admin approval.",
      restaurant: buildOwnerRestaurantPayload(restaurant)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login restaurant owner
router.post("/login", async (req, res) => {
  try {
    const email = sanitizeOptionalEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "email and password are required" });

    const restaurant = await Restaurant.findOne({ email });
    if (!restaurant) return res.status(401).json({ error: "Invalid credentials" });

    await syncRestaurantLifecycle(restaurant);

    const valid = await restaurant.comparePassword(password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const access = buildRestaurantAccessState(restaurant);
    if (!access.ownerPanelAllowed) {
      return res.status(403).json({ error: access.ownerLoginMessage });
    }

    const token = buildOwnerToken(restaurant);

    res.json({
      token,
      restaurant: buildOwnerRestaurantPayload(restaurant)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/owner/profile", verifyOwnerToken, async (req, res) => {
  const restaurant = req.owner.restaurant;
  return res.json(buildOwnerRestaurantPayload(restaurant));
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
      restaurant: buildOwnerRestaurantPayload(restaurant)
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
      restaurant: buildOwnerRestaurantPayload(restaurant)
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
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    await syncRestaurantLifecycle(restaurant);
    const access = buildRestaurantAccessState(restaurant);

    return res.json({
      _id: restaurant._id,
      name: restaurant.name,
      address: restaurant.address || "",
      logoUrl: restaurant.logoUrl || "",
      phone: restaurant.phone || "",
      approvalStatus: access.approvalStatus,
      restaurantStatus: access.restaurantStatus,
      effectiveStatus: access.effectiveStatus,
      subscriptionStatus: access.subscriptionStatus,
      publicOrderingEnabled: access.publicOrderingEnabled,
      canAcceptNewOrders: access.canAcceptNewOrders,
      publicMessage: access.publicMessage,
      orderRestrictionMessage: access.orderRestrictionMessage
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
