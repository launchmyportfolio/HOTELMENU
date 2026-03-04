import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useState } from "react";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Items from "./pages/Items";
import Cart from "./pages/Cart";
import Contact from "./pages/Contact";
import Status from "./pages/Status";

import AdminLogin from "./admin/AdminLogin";
import AdminDashboard from "./admin/AdminDashboard";


function App() {

  const [cart, setCart] = useState([]);

  function addToCart(item) {
    setCart(prev => [...prev, item]);
  }

  return (

    <BrowserRouter>

      <Navbar />

      <Routes>

        <Route path="/" element={<Home />} />

        <Route
          path="/items"
          element={<Items addToCart={addToCart} />}
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route
          path="/cart"
          element={<Cart cart={cart} />}
        />

        <Route path="/contact" element={<Contact />} />
        <Route path="/status" element={<Status />} />

      </Routes>

    </BrowserRouter>
  );
}

export default App;