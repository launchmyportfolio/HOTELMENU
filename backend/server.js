const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const orderRoutes = require("./routes/orders");

const app = express();

app.use(cors());
app.use(express.json());


// MongoDB Connection
mongoose.connect("mongodb://127.0.0.1:27017/restaurantDB")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));


// Routes
app.use("/api/orders", orderRoutes);


// Test route
app.get("/", (req, res) => {
  res.send("Restaurant Backend Running");
});


const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});