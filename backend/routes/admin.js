const express = require("express");
const router = express.Router();

const ADMIN_USER = process.env.ADMIN_USERNAME || "Admin@123";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Admin@123";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "supersecureadmintoken";

// Admin login - returns static token for simplicity
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ token: ADMIN_TOKEN, role: "admin" });
  }

  return res.status(401).json({ error: "Invalid credentials" });
});

module.exports = router;
