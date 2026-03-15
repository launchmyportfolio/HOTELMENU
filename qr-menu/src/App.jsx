import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Items from "./pages/Items";
import Cart from "./pages/Cart";
import Contact from "./pages/Contact";
import Status from "./pages/Status";

import AdminLogin from "./admin/AdminLogin";
import AdminDashboard from "./admin/AdminDashboard";
import MenuManagement from "./admin/MenuManagement";
import AddProduct from "./admin/AddProduct";
import EditProduct from "./admin/EditProduct";
import CustomerLogin from "./pages/CustomerLogin";

const API_BASE = import.meta.env.VITE_API_URL;

function AdminRoute({ isAdmin, children }) {
  return isAdmin ? children : <Navigate to="/admin/login" replace />;
}

function CustomerRoute({ session, children }) {
  return session ? children : <Navigate to="/login" replace />;
}

function App() {

  const [adminToken, setAdminToken] = useState(
    localStorage.getItem("adminToken") || ""
  );

  const [customerSession, setCustomerSession] = useState(() => {
    const stored = localStorage.getItem("customerSession");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch (_err) {
      return null;
    }
  });

  useEffect(() => {
    if (adminToken) {
      localStorage.setItem("adminToken", adminToken);
    } else {
      localStorage.removeItem("adminToken");
    }
  }, [adminToken]);

  useEffect(() => {
    if (customerSession) {
      localStorage.setItem("customerSession", JSON.stringify(customerSession));
    } else {
      localStorage.removeItem("customerSession");
    }
  }, [customerSession]);

  useEffect(() => {
    async function verifySession() {
      if (!customerSession) return;

      try {
        const res = await fetch(`${API_BASE}/api/customer/session/${customerSession.tableNumber}`);
        const data = await res.json();

        if (!data.active || data.session?.sessionId !== customerSession.sessionId) {
          setCustomerSession(null);
        }
      } catch (err) {
        console.error("Session check failed", err);
      }
    }

    if (!customerSession) return undefined;

    verifySession();
    const interval = setInterval(verifySession, 15000);

    return () => clearInterval(interval);
  }, [customerSession]);

  const isAdmin = Boolean(adminToken);

  function handleLogout() {
    setAdminToken("");
  }

  async function handleEndSession() {
    if (!customerSession) return;

    try {
      const res = await fetch(`${API_BASE}/api/customer/session/end`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableNumber: customerSession.tableNumber,
          sessionId: customerSession.sessionId
        })
      });

      if (!res.ok && res.status !== 404) {
        throw new Error("Unable to end session.");
      }
    } catch (err) {
      console.error("Failed to end session", err);
      return;
    }

    setCustomerSession(null);
  }

  return (

    <BrowserRouter>

      <Navbar
        isAdmin={isAdmin}
        onLogout={handleLogout}
        session={customerSession}
        onEndSession={handleEndSession}
      />

      <Routes>

        <Route
          path="/login"
          element={
            <CustomerLogin
              session={customerSession}
              onLogin={setCustomerSession}
            />
          }
        />

        <Route
          path="/"
          element={
            <CustomerRoute session={customerSession}>
              <Home />
            </CustomerRoute>
          }
        />
        <Route
          path="/items"
          element={
            <CustomerRoute session={customerSession}>
              <Items />
            </CustomerRoute>
          }
        />
        <Route
          path="/cart"
          element={
            <CustomerRoute session={customerSession}>
              <Cart session={customerSession} />
            </CustomerRoute>
          }
        />
        <Route
          path="/contact"
          element={
            <CustomerRoute session={customerSession}>
              <Contact />
            </CustomerRoute>
          }
        />
        <Route
          path="/status"
          element={
            <CustomerRoute session={customerSession}>
              <Status />
            </CustomerRoute>
          }
        />

        <Route
          path="/admin/login"
          element={<AdminLogin onLogin={setAdminToken} isAdmin={isAdmin} />}
        />

        <Route
          path="/admin/dashboard"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <AdminDashboard token={adminToken} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/orders"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <AdminDashboard token={adminToken} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/menu"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <MenuManagement token={adminToken} mode="manage" />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/add-product"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <AddProduct token={adminToken} />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/edit-product"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <MenuManagement token={adminToken} mode="edit" />
            </AdminRoute>
          }
        />

        <Route
          path="/admin/edit-product/:id"
          element={
            <AdminRoute isAdmin={isAdmin}>
              <EditProduct token={adminToken} />
            </AdminRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>

    </BrowserRouter>
  );
}

export default App;
