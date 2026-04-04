require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const http = require("http");
const { Server } = require("socket.io");
const {
  setIo,
  getRestaurantRoom,
  getRoleRoom,
  getTableRoom,
  getRestaurantTableRoom
} = require("./socketEmitter");
const { cleanupOldNotifications } = require("./services/notificationService");

const orderRoutes = require("./routes/orders");
const menuRoutes = require("./routes/menu");
const adminRoutes = require("./routes/admin");
const customerSessionRoutes = require("./routes/customerSession");
const tableRoutes = require("./routes/tables");
const restaurantRoutes = require("./routes/restaurants");
const notificationRoutes = require("./routes/notifications");
const paymentSettingsRoutes = require("./routes/paymentSettings");
const paymentOptionsRoutes = require("./routes/paymentOptions");
const ownerAnalyticsRoutes = require("./routes/ownerAnalytics");
const receiptRoutes = require("./routes/receipts");
const { customerRouter: razorpayPaymentRoutes, webhookRouter: razorpayWebhookRoutes } = require("./routes/razorpayPayments");

const app = express();

function parseAllowedOrigins(value = "") {
  return String(value || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);
}

const configuredCorsOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
const allowAllCorsOrigins = configuredCorsOrigins.length === 0;
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowAllCorsOrigins || configuredCorsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
};

const server = http.createServer(app);
const io = new Server(server, {
  cors: corsOptions
});
setIo(io);

app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.use("/api/payments/razorpay/webhook", express.raw({ type: "application/json", limit: "2mb" }), razorpayWebhookRoutes);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Socket.io connection log
io.on("connection", socket => {
  console.log("Socket connected", socket.id);

  socket.on("join-room", payload => {
    try {
      const restaurantId = payload?.restaurantId;
      const tableNumber = Number(payload?.tableNumber);
      const role = String(payload?.role || "").trim().toUpperCase();
      const roles = Array.isArray(payload?.roles)
        ? payload.roles.map(r => String(r || "").trim().toUpperCase()).filter(Boolean)
        : [];

      if (restaurantId) {
        socket.join(getRestaurantRoom(restaurantId));
      }

      if (restaurantId && role) {
        socket.join(getRoleRoom(role, restaurantId));
      }

      if (restaurantId && roles.length) {
        roles.forEach(roomRole => socket.join(getRoleRoom(roomRole, restaurantId)));
      }

      if (Number.isFinite(tableNumber) && tableNumber > 0) {
        socket.join(getTableRoom(tableNumber));
        if (restaurantId) {
          socket.join(getRestaurantTableRoom(restaurantId, tableNumber));
        }
      }
    } catch (_err) {
      // ignore malformed join requests
    }
  });

  socket.on("disconnect", () => console.log("Socket disconnected", socket.id));
});

// Routes
app.use("/api/orders", orderRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/admin", adminRoutes); // legacy
app.use("/api/customer/session", customerSessionRoutes);
app.use("/api/admin/tables", tableRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/payment-settings", paymentSettingsRoutes);
app.use("/api/payment-options", paymentOptionsRoutes);
app.use("/api/payments/razorpay", razorpayPaymentRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/owner/analytics", ownerAnalyticsRoutes);

app.use((err, req, res, next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({
      error: "Request payload is too large. Please upload a smaller QR image (or compress it) and try again."
    });
  }
  return next(err);
});

// Test route
app.get("/", (req, res) => {
  res.send("Restaurant Backend Running");
});

const PORT = process.env.PORT || 5000;

setInterval(() => {
  cleanupOldNotifications().catch(() => {});
}, 12 * 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
