const jwt = require("jsonwebtoken");
const Restaurant = require("../models/Restaurant");
const {
  syncRestaurantLifecycle,
  buildRestaurantAccessState
} = require("../services/restaurantAccessService");

const JWT_SECRET = process.env.OWNER_JWT_SECRET || "restaurant-secret";

module.exports = async function verifyOwnerToken(req, res, next) {
  const headerToken = req.headers.authorization || req.headers["x-owner-token"];
  const token = headerToken?.startsWith("Bearer ") ? headerToken.slice(7) : headerToken;

  if (!token) return res.status(401).json({ error: "Owner token required" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const restaurant = await Restaurant.findById(payload.restaurantId).select(
      "_id tokenVersion name email ownerName phone address logoUrl approvalStatus restaurantStatus subscriptionStatus subscriptionPlan planType subscriptionStartDate subscriptionEndDate lastPaymentDate createdByAdmin approvedByAdmin approvedAt rejectedAt rejectionReason"
    );
    if (!restaurant) {
      return res.status(401).json({ error: "Owner account not found" });
    }

    await syncRestaurantLifecycle(restaurant);
    const access = buildRestaurantAccessState(restaurant);

    const tokenVersion = Number(payload.tokenVersion || 0);
    if (tokenVersion !== Number(restaurant.tokenVersion || 0)) {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }

    if (!access.ownerPanelAllowed) {
      return res.status(403).json({ error: access.ownerLoginMessage });
    }

    req.owner = {
      restaurantId: payload.restaurantId,
      ownerId: payload.ownerId,
      tokenVersion,
      restaurant,
      access
    };
    req.restaurantId = payload.restaurantId;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
