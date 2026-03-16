const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.OWNER_JWT_SECRET || "restaurant-secret";

module.exports = function requireOwner(req, res, next) {
  const headerToken = req.headers.authorization || req.headers["x-owner-token"];
  const token = headerToken?.startsWith("Bearer ") ? headerToken.slice(7) : headerToken;

  if (!token) return res.status(401).json({ error: "Owner token required" });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.owner = { restaurantId: payload.restaurantId, ownerId: payload.ownerId };
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
