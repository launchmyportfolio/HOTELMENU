const express = require("express");
const router = express.Router();
const Restaurant = require("../models/Restaurant");

const ADMIN_USER = process.env.ADMIN_USERNAME || "Admin@123";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Admin@123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "supersecureadmintoken";

function checkAdminToken(req, res) {
  const headerToken = req.headers.authorization || req.headers["x-admin-token"];
  const token = headerToken?.startsWith("Bearer ")
    ? headerToken.slice(7)
    : headerToken;

  if (token !== ADMIN_TOKEN) {
    res.status(401).json({ error: "Unauthorized" });
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

// List all restaurants (admin only)
router.get("/restarents", (req, res) => { // spelling as requested
  if (!checkAdminToken(req, res)) return;

  Restaurant.find({}, "name ownerName email phone address createdAt")
    .sort({ createdAt: -1 })
    .then(list => res.json(list))
    .catch(err => res.status(500).json({ error: err.message }));
});

// Delete a restaurant (admin only)
router.delete("/restarents/:id", async (req, res) => {
  if (!checkAdminToken(req, res)) return;
  try {
    const deleted = await Restaurant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Restaurant not found" });
    res.json({ message: "Restaurant deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
