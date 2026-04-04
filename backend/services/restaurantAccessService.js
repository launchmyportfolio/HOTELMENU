const Restaurant = require("../models/Restaurant");

const APPROVAL_STATUS = {
  PENDING_APPROVAL: "PENDING_APPROVAL",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED"
};

const RESTAURANT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  EXPIRED: "EXPIRED"
};

const SUBSCRIPTION_STATUS = {
  PAID: "PAID",
  UNPAID: "UNPAID",
  PENDING: "PENDING"
};

const SUBSCRIPTION_PLAN = {
  BASIC: "BASIC",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE"
};

const PLAN_TYPE = {
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY"
};

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(allowedValues).includes(normalized) ? normalized : fallback;
}

function normalizeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function applyRestaurantDefaults(restaurant = {}) {
  const safe = restaurant.toObject ? restaurant.toObject() : { ...restaurant };
  return {
    ...safe,
    approvalStatus: normalizeEnum(safe.approvalStatus, APPROVAL_STATUS, APPROVAL_STATUS.APPROVED),
    restaurantStatus: normalizeEnum(safe.restaurantStatus, RESTAURANT_STATUS, RESTAURANT_STATUS.ACTIVE),
    subscriptionStatus: normalizeEnum(safe.subscriptionStatus, SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUS.PAID),
    subscriptionPlan: normalizeEnum(safe.subscriptionPlan, SUBSCRIPTION_PLAN, SUBSCRIPTION_PLAN.BASIC),
    planType: normalizeEnum(safe.planType, PLAN_TYPE, PLAN_TYPE.MONTHLY),
    subscriptionStartDate: normalizeDate(safe.subscriptionStartDate),
    subscriptionEndDate: normalizeDate(safe.subscriptionEndDate),
    lastPaymentDate: normalizeDate(safe.lastPaymentDate),
    createdByAdmin: safe.createdByAdmin === true,
    approvedByAdmin: String(safe.approvedByAdmin || "").trim(),
    approvedAt: normalizeDate(safe.approvedAt),
    rejectedAt: normalizeDate(safe.rejectedAt),
    rejectionReason: String(safe.rejectionReason || "").trim()
  };
}

function deriveEffectiveRestaurantStatus(restaurant = {}, now = new Date()) {
  const normalized = applyRestaurantDefaults(restaurant);

  if (normalized.approvalStatus === APPROVAL_STATUS.PENDING_APPROVAL) {
    return APPROVAL_STATUS.PENDING_APPROVAL;
  }

  if (normalized.approvalStatus === APPROVAL_STATUS.REJECTED) {
    return APPROVAL_STATUS.REJECTED;
  }

  if (normalized.restaurantStatus === RESTAURANT_STATUS.SUSPENDED) {
    return RESTAURANT_STATUS.SUSPENDED;
  }

  if (
    normalized.subscriptionEndDate
    && normalized.subscriptionEndDate.getTime() < now.getTime()
  ) {
    return RESTAURANT_STATUS.EXPIRED;
  }

  if (normalized.restaurantStatus === RESTAURANT_STATUS.INACTIVE) {
    return RESTAURANT_STATUS.INACTIVE;
  }

  return RESTAURANT_STATUS.ACTIVE;
}

async function syncRestaurantLifecycle(restaurant, options = {}) {
  if (!restaurant?._id) return restaurant;

  const normalized = applyRestaurantDefaults(restaurant);
  const effectiveStatus = deriveEffectiveRestaurantStatus(normalized, options.now || new Date());
  const updates = {};

  if (!restaurant.approvalStatus) updates.approvalStatus = normalized.approvalStatus;
  if (!restaurant.restaurantStatus) updates.restaurantStatus = normalized.restaurantStatus;
  if (!restaurant.subscriptionStatus) updates.subscriptionStatus = normalized.subscriptionStatus;
  if (!restaurant.subscriptionPlan) updates.subscriptionPlan = normalized.subscriptionPlan;
  if (!restaurant.planType) updates.planType = normalized.planType;

  if (
    effectiveStatus === RESTAURANT_STATUS.EXPIRED
    && String(restaurant.restaurantStatus || "").trim().toUpperCase() !== RESTAURANT_STATUS.EXPIRED
  ) {
    updates.restaurantStatus = RESTAURANT_STATUS.EXPIRED;
  }

  if (Object.keys(updates).length) {
    Object.assign(restaurant, updates);
    await restaurant.save();
  }

  return restaurant;
}

function buildRestaurantAccessState(restaurant = {}, options = {}) {
  const normalized = applyRestaurantDefaults(restaurant);
  const effectiveStatus = deriveEffectiveRestaurantStatus(normalized, options.now || new Date());
  const isApproved = normalized.approvalStatus === APPROVAL_STATUS.APPROVED;
  const ownerPanelAllowed = effectiveStatus === RESTAURANT_STATUS.ACTIVE;
  const canAcceptNewOrders = ownerPanelAllowed && normalized.subscriptionStatus === SUBSCRIPTION_STATUS.PAID;
  const publicOrderingEnabled = ownerPanelAllowed;

  let ownerLoginMessage = "";
  if (!ownerPanelAllowed) {
    ownerLoginMessage = "Your subscription is inactive or pending approval. Please contact admin.";
  }

  let publicMessage = "";
  if (!publicOrderingEnabled) {
    publicMessage = "This restaurant is currently inactive. Please contact restaurant owner.";
  }

  let orderRestrictionMessage = "";
  if (!publicOrderingEnabled) {
    orderRestrictionMessage = publicMessage;
  } else if (!canAcceptNewOrders) {
    orderRestrictionMessage = "This restaurant is not accepting new orders right now because subscription payment is pending.";
  }

  return {
    approvalStatus: normalized.approvalStatus,
    restaurantStatus: normalized.restaurantStatus,
    effectiveStatus,
    subscriptionStatus: normalized.subscriptionStatus,
    subscriptionPlan: normalized.subscriptionPlan,
    planType: normalized.planType,
    subscriptionStartDate: normalized.subscriptionStartDate,
    subscriptionEndDate: normalized.subscriptionEndDate,
    lastPaymentDate: normalized.lastPaymentDate,
    ownerPanelAllowed,
    publicOrderingEnabled,
    canAcceptNewOrders,
    ownerLoginMessage,
    publicMessage,
    orderRestrictionMessage
  };
}

function buildRestaurantAdminSummary(restaurant = {}, options = {}) {
  const normalized = applyRestaurantDefaults(restaurant);
  const access = buildRestaurantAccessState(normalized, options);

  return {
    _id: String(normalized._id || ""),
    name: normalized.name || "",
    ownerName: normalized.ownerName || "",
    email: normalized.email || "",
    phone: normalized.phone || "",
    address: normalized.address || "",
    createdAt: normalized.createdAt || null,
    registrationDate: normalized.createdAt || null,
    approvalStatus: access.approvalStatus,
    restaurantStatus: access.restaurantStatus,
    effectiveStatus: access.effectiveStatus,
    subscriptionStatus: access.subscriptionStatus,
    paymentStatus: access.subscriptionStatus,
    subscriptionPlan: access.subscriptionPlan,
    planType: access.planType,
    subscriptionStartDate: access.subscriptionStartDate,
    subscriptionEndDate: access.subscriptionEndDate,
    lastPaymentDate: access.lastPaymentDate,
    createdByAdmin: normalized.createdByAdmin === true,
    approvedByAdmin: normalized.approvedByAdmin || "",
    approvedAt: normalized.approvedAt || null,
    rejectedAt: normalized.rejectedAt || null,
    rejectionReason: normalized.rejectionReason || "",
    access
  };
}

async function findRestaurantAndSyncById(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) return null;
  await syncRestaurantLifecycle(restaurant);
  return restaurant;
}

module.exports = {
  APPROVAL_STATUS,
  RESTAURANT_STATUS,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_PLAN,
  PLAN_TYPE,
  applyRestaurantDefaults,
  deriveEffectiveRestaurantStatus,
  syncRestaurantLifecycle,
  buildRestaurantAccessState,
  buildRestaurantAdminSummary,
  findRestaurantAndSyncById
};
