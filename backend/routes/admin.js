const express = require("express");
const Restaurant = require("../models/Restaurant");
const SubscriptionPayment = require("../models/SubscriptionPayment");
const isAdmin = require("../middleware/isAdmin");
const {
  APPROVAL_STATUS,
  RESTAURANT_STATUS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PLAN_TYPE,
  buildRestaurantAccessState,
  buildRestaurantAdminSummary,
  syncRestaurantLifecycle
} = require("../services/restaurantAccessService");
const { validateRestaurantRazorpayConfiguration } = require("../services/payments/razorpayConfigService");

const router = express.Router();

const ADMIN_USER = process.env.ADMIN_USERNAME || "Admin@123";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Admin@123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "supersecureadmintoken";

function sanitizeText(value, max = 220) {
  return String(value || "").trim().slice(0, max);
}

function normalizeEnum(value, enumMap, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(enumMap).includes(normalized) ? normalized : fallback;
}

function normalizeOptionalDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid date supplied.");
  }
  return parsed;
}

function toPositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function findRestaurantOr404(id, res) {
  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" });
    return null;
  }

  await syncRestaurantLifecycle(restaurant);
  return restaurant;
}

function matchesRestaurantFilters(summary, filters = {}) {
  if (filters.search) {
    const term = filters.search.toLowerCase();
    const fields = [
      summary.name,
      summary.ownerName,
      summary.email,
      summary.phone,
      summary.address
    ];
    const found = fields.some(value => String(value || "").toLowerCase().includes(term));
    if (!found) return false;
  }

  if (filters.approvalStatus && summary.approvalStatus !== filters.approvalStatus) {
    return false;
  }

  if (filters.restaurantStatus && summary.effectiveStatus !== filters.restaurantStatus) {
    return false;
  }

  if (filters.subscriptionStatus && summary.subscriptionStatus !== filters.subscriptionStatus) {
    return false;
  }

  return true;
}

// Admin login - returns static token for simplicity
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN, role: "admin" });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

router.get("/restaurants", isAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.find({}).sort({ createdAt: -1 });
    await Promise.all(restaurants.map(restaurant => syncRestaurantLifecycle(restaurant)));

    const filters = {
      search: sanitizeText(req.query.search || "", 120),
      approvalStatus: req.query.approvalStatus
        ? normalizeEnum(req.query.approvalStatus, APPROVAL_STATUS, "")
        : "",
      restaurantStatus: req.query.restaurantStatus
        ? normalizeEnum(req.query.restaurantStatus, { ...RESTAURANT_STATUS, ...APPROVAL_STATUS }, "")
        : "",
      subscriptionStatus: req.query.subscriptionStatus
        ? normalizeEnum(req.query.subscriptionStatus, SUBSCRIPTION_STATUS, "")
        : ""
    };

    const items = restaurants
      .map(restaurant => buildRestaurantAdminSummary(restaurant))
      .filter(item => matchesRestaurantFilters(item, filters));

    return res.json({ restaurants: items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/restarents", isAdmin, async (req, res) => {
  try {
    const restaurants = await Restaurant.find({}).sort({ createdAt: -1 });
    await Promise.all(restaurants.map(restaurant => syncRestaurantLifecycle(restaurant)));
    return res.json(restaurants.map(restaurant => buildRestaurantAdminSummary(restaurant)));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get("/restaurants/:id", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    const payments = await SubscriptionPayment.find({ restaurantId: restaurant._id }).sort({ createdAt: -1 }).limit(20);
    const razorpayConfig = await validateRestaurantRazorpayConfiguration(restaurant._id, {
      restaurant,
      persist: false
    });

    return res.json({
      restaurant: buildRestaurantAdminSummary(restaurant),
      subscriptionPayments: payments,
      razorpayConfig
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.patch("/restaurants/:id/payment-mode", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    restaurant.paymentModeEnabled = req.body?.paymentModeEnabled !== false;
    if (restaurant.paymentModeEnabled === false) {
      restaurant.paymentConfigurationStatus = "DISABLED";
      restaurant.paymentConfigurationMessage = "Razorpay disabled by super admin.";
      restaurant.paymentConfigurationValidatedAt = new Date();
    }

    await restaurant.save();

    return res.json({
      message: restaurant.paymentModeEnabled
        ? "Restaurant payment mode enabled."
        : "Restaurant payment mode disabled.",
      restaurant: buildRestaurantAdminSummary(restaurant)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.post("/restaurants/:id/validate-razorpay", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    const validation = await validateRestaurantRazorpayConfiguration(restaurant._id, {
      restaurant,
      persist: true
    });

    if (validation.status === "INVALID" && req.body?.disableOnFailure === true) {
      restaurant.paymentModeEnabled = false;
      restaurant.paymentConfigurationStatus = "DISABLED";
      restaurant.paymentConfigurationMessage = `Disabled by admin after failed validation: ${validation.message}`;
      restaurant.paymentConfigurationValidatedAt = new Date();
      await restaurant.save();
    }

    return res.json({
      message: validation.message,
      validation,
      restaurant: buildRestaurantAdminSummary(restaurant)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/restaurants/:id/approval", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    const nextApprovalStatus = normalizeEnum(req.body.approvalStatus, APPROVAL_STATUS, "");
    if (!nextApprovalStatus) {
      return res.status(400).json({ error: "Valid approvalStatus is required." });
    }

    restaurant.approvalStatus = nextApprovalStatus;

    if (nextApprovalStatus === APPROVAL_STATUS.APPROVED) {
      restaurant.approvedByAdmin = "SUPER_ADMIN";
      restaurant.approvedAt = new Date();
      restaurant.rejectedAt = null;
      restaurant.rejectionReason = "";
    }

    if (nextApprovalStatus === APPROVAL_STATUS.REJECTED) {
      restaurant.rejectedAt = new Date();
      restaurant.rejectionReason = sanitizeText(req.body.rejectionReason || "", 300);
      restaurant.restaurantStatus = RESTAURANT_STATUS.INACTIVE;
    }

    await restaurant.save();
    await syncRestaurantLifecycle(restaurant);

    return res.json({
      message: `Restaurant ${nextApprovalStatus === APPROVAL_STATUS.APPROVED ? "approved" : "rejected"} successfully.`,
      restaurant: buildRestaurantAdminSummary(restaurant)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/restaurants/:id/status", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    const nextStatus = normalizeEnum(req.body.restaurantStatus, RESTAURANT_STATUS, "");
    if (!nextStatus) {
      return res.status(400).json({ error: "Valid restaurantStatus is required." });
    }

    restaurant.restaurantStatus = nextStatus;
    if (nextStatus === RESTAURANT_STATUS.SUSPENDED) {
      restaurant.suspendedAt = new Date();
    }
    if (nextStatus === RESTAURANT_STATUS.INACTIVE) {
      restaurant.deactivatedAt = new Date();
    }

    await restaurant.save();
    await syncRestaurantLifecycle(restaurant);

    return res.json({
      message: `Restaurant status updated to ${nextStatus}.`,
      restaurant: buildRestaurantAdminSummary(restaurant)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/restaurants/:id/subscription", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    restaurant.subscriptionPlan = normalizeEnum(
      req.body.subscriptionPlan,
      SUBSCRIPTION_PLAN,
      restaurant.subscriptionPlan || SUBSCRIPTION_PLAN.BASIC
    );
    restaurant.planType = normalizeEnum(
      req.body.planType,
      PLAN_TYPE,
      restaurant.planType || PLAN_TYPE.MONTHLY
    );
    restaurant.subscriptionStartDate = normalizeOptionalDate(req.body.subscriptionStartDate);
    restaurant.subscriptionEndDate = normalizeOptionalDate(req.body.subscriptionEndDate);

    await restaurant.save();
    await syncRestaurantLifecycle(restaurant);

    return res.json({
      message: "Subscription updated successfully.",
      restaurant: buildRestaurantAdminSummary(restaurant)
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.patch("/restaurants/:id/payment", isAdmin, async (req, res) => {
  try {
    const restaurant = await findRestaurantOr404(req.params.id, res);
    if (!restaurant) return;

    const nextSubscriptionStatus = normalizeEnum(
      req.body.subscriptionStatus,
      SUBSCRIPTION_STATUS,
      restaurant.subscriptionStatus || SUBSCRIPTION_STATUS.UNPAID
    );

    restaurant.subscriptionStatus = nextSubscriptionStatus;
    restaurant.lastPaymentDate = nextSubscriptionStatus === SUBSCRIPTION_STATUS.PAID
      ? (normalizeOptionalDate(req.body.lastPaymentDate) || new Date())
      : normalizeOptionalDate(req.body.lastPaymentDate);

    await restaurant.save();
    await syncRestaurantLifecycle(restaurant);

    const paymentRecord = await SubscriptionPayment.create({
      restaurantId: restaurant._id,
      subscriptionPlan: normalizeEnum(req.body.subscriptionPlan || restaurant.subscriptionPlan, SUBSCRIPTION_PLAN, restaurant.subscriptionPlan),
      planType: normalizeEnum(req.body.planType || restaurant.planType, PLAN_TYPE, restaurant.planType),
      amount: toPositiveNumber(req.body.amount, 0),
      paymentStatus: nextSubscriptionStatus === SUBSCRIPTION_STATUS.PAID ? "PAID" : nextSubscriptionStatus,
      paymentDate: restaurant.lastPaymentDate,
      periodStartDate: normalizeOptionalDate(req.body.periodStartDate) || restaurant.subscriptionStartDate || null,
      periodEndDate: normalizeOptionalDate(req.body.periodEndDate) || restaurant.subscriptionEndDate || null,
      notes: sanitizeText(req.body.notes || "", 400),
      markedByAdmin: "SUPER_ADMIN"
    });

    return res.json({
      message: "Subscription payment status updated successfully.",
      restaurant: buildRestaurantAdminSummary(restaurant),
      subscriptionPayment: paymentRecord
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

router.delete("/restarents/:id", isAdmin, async (req, res) => {
  try {
    const deleted = await Restaurant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Restaurant not found" });
    await SubscriptionPayment.deleteMany({ restaurantId: req.params.id });
    return res.json({ message: "Restaurant deleted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
