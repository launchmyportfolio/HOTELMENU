require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const http = require("http");
const { Server } = require("socket.io");
const { setIo } = require("./socketEmitter");

const orderRoutes = require("./routes/orders");
const menuRoutes = require("./routes/menu");
const adminRoutes = require("./routes/admin");
const customerSessionRoutes = require("./routes/customerSession");
const tableRoutes = require("./routes/tables");
const restaurantRoutes = require("./routes/restaurants");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }
});
setIo(io);

app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Socket.io connection log
io.on("connection", socket => {
  console.log("Socket connected", socket.id);
  socket.on("disconnect", () => console.log("Socket disconnected", socket.id));
});

// Routes
app.use("/api/orders", orderRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/admin", adminRoutes); // legacy
app.use("/api/customer/session", customerSessionRoutes);
app.use("/api/admin/tables", tableRoutes);
app.use("/api/restaurants", restaurantRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Restaurant Backend Running");
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
