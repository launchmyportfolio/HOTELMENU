// Simple admin auth middleware using a shared token
// Expects header Authorization: Bearer <token> or x-admin-token
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "supersecureadmintoken";

module.exports = function isAdmin(req, res, next) {
  const headerToken = req.headers.authorization || req.headers["x-admin-token"];
  const token = headerToken?.startsWith("Bearer ")
    ? headerToken.slice(7)
    : headerToken;

  if (token && token === ADMIN_TOKEN) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized: Admin access required" });
};
