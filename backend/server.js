require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const orderRoutes = require("./routes/orders");
const menuRoutes = require("./routes/menu");
const adminRoutes = require("./routes/admin");
const customerSessionRoutes = require("./routes/customerSession");

const app = express();

app.use(cors());
app.use(express.json());


// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));


// Routes
app.use("/api/orders", orderRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/customer/session", customerSessionRoutes);


// Test route
app.get("/", (req, res) => {
  res.send("Restaurant Backend Running");
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
