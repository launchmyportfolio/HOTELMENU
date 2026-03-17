import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Items from "./pages/Items";
import Cart from "./pages/Cart";
import Contact from "./pages/Contact";
import Status from "./pages/Status";

import AdminHome from "./admin/AdminHome";
import AdminOrders from "./admin/AdminOrders";
import MenuManagement from "./admin/MenuManagement";
import AddProduct from "./admin/AddProduct";
import EditProduct from "./admin/EditProduct";
import CustomerLogin from "./pages/CustomerLogin";
import TablesDashboard from "./admin/TablesDashboard";
import Footer from "./components/Footer";
import AdminLogin from "./admin/AdminLogin"; // reused UI for owner login
import OwnerRegister from "./admin/OwnerRegister";
import AdminRestaurants from "./admin/AdminRestaurants";
import AdminCreateRestaurant from "./admin/AdminCreateRestaurant";
import AuthLayout from "./layouts/AuthLayout";
import { useCustomerSession } from "./context/CustomerSessionContext";

const API_BASE = import.meta.env.VITE_API_URL;

function useTableFromSearch() {
  const location = useLocation();
  return useMemo(() => {
    const params = new URLSearchParams(location.search);
    const t = Number(params.get("table"));
    return Number.isFinite(t) && t > 0 ? t : null;
  }, [location.search]);
}

function OwnerRoute({ auth, children }) {
  return auth?.token ? children : <Navigate to="/owner/login" replace />;
}

function CustomerRoute({ children }) {
  const { session, clearSession } = useCustomerSession();
  const location = useLocation();
  const params = useParams();
  const restaurantId = params.restaurantId;
  const tableNumber = useTableFromSearch();
  const search = location.search || "";
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;

    async function verifySession() {
      if (!restaurantId || !tableNumber) {
        setStatus("home");
        return;
      }

      if (!session || session.restaurantId !== restaurantId || session.tableNumber !== tableNumber) {
        setStatus("login");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/customer/session/${tableNumber}?restaurantId=${restaurantId}`);
        const data = await res.json();

        if (!active) return;

        if (data.active && data.session?.sessionId === session.sessionId) {
          setStatus("ok");
        } else {
          clearSession();
          setStatus("home");
        }
      } catch (_err) {
        if (!active) return;
        setStatus("home");
      }
    }

    verifySession();

    return () => {
      active = false;
    };
  }, [session, restaurantId, tableNumber, clearSession]);

  if (status === "home") return <Navigate to="/" replace />;
  if (status === "login") return <Navigate to={`/restaurant/${restaurantId}/login${search}`} replace />;
  if (status !== "ok") return null;
  return children;
}

function CustomerLoginRoute({ session, onLogin }) {
  const tableNumber = useTableFromSearch();
  const params = useParams();
  const restaurantId = params.restaurantId;

  if (!restaurantId || !tableNumber) {
    return <Navigate to="/" replace />;
  }

  return (
    <CustomerLogin
      session={session}
      onLogin={onLogin}
    />
  );
}

function AppRoutes() {
  const location = useLocation();
  const { session, setSession, clearSession } = useCustomerSession();
  const [ownerAuth, setOwnerAuth] = useState(() => {
    try {
      const stored = localStorage.getItem("ownerAuth");
      return stored ? JSON.parse(stored) : null;
    } catch (_err) {
      return null;
    }
  });
  const [adminAuth, setAdminAuth] = useState(() => localStorage.getItem("adminToken") || "");

  useEffect(() => {
    if (ownerAuth) {
      localStorage.setItem("ownerAuth", JSON.stringify(ownerAuth));
    } else {
      localStorage.removeItem("ownerAuth");
    }
  }, [ownerAuth]);

  useEffect(() => {
    if (adminAuth) {
      localStorage.setItem("adminToken", adminAuth);
    } else {
      localStorage.removeItem("adminToken");
    }
  }, [adminAuth]);

  useEffect(() => {
    async function verifySession() {
      if (!session) return;
      try {
        const res = await fetch(`${API_BASE}/api/customer/session/${session.tableNumber}?restaurantId=${session.restaurantId}`);
        const data = await res.json();
        if (!data.active || data.session?.sessionId !== session.sessionId) {
          clearSession();
        }
      } catch (err) {
        console.error("Session check failed", err);
      }
    }
    if (!session) return undefined;
    verifySession();
    const interval = setInterval(verifySession, 15000);
    return () => clearInterval(interval);
  }, [session, clearSession]);

  async function handleEndSession() {
    if (!session) return;
    try {
      const res = await fetch(`${API_BASE}/api/customer/session/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId: session.restaurantId,
          tableNumber: session.tableNumber,
          sessionId: session.sessionId
        })
      });
      if (!res.ok && res.status !== 404) throw new Error("Unable to end session.");
    } catch (err) {
      console.error("Failed to end session", err);
    }
    clearSession();
  }

  function handleOwnerLogout() {
    setOwnerAuth(null);
  }
  function handleAdminLogout() {
    setAdminAuth("");
  }

  const navSession = useMemo(() => session, [session]);

  return (
    <>
      <Navbar
        isAdmin={Boolean(ownerAuth?.token || adminAuth)}
        onLogout={ownerAuth?.token ? handleOwnerLogout : handleAdminLogout}
        session={navSession}
        onEndSession={handleEndSession}
        adminMode={Boolean(adminAuth && !ownerAuth?.token)}
      />

      <Routes>

        <Route path="/" element={<Landing />} />

        <Route
          path="/restaurant/:restaurantId/login"
          element={(
            <AuthLayout>
              <CustomerLoginRoute session={session} onLogin={setSession} />
            </AuthLayout>
          )}
        />

        <Route
          path="/restaurant/:restaurantId"
          element={
            <CustomerRoute>
              <Home />
            </CustomerRoute>
          }
        />

        <Route
          path="/restaurant/:restaurantId/items"
          element={
            <CustomerRoute>
              <Items />
            </CustomerRoute>
          }
        />

        <Route
          path="/restaurant/:restaurantId/cart"
          element={
            <CustomerRoute>
              <Cart session={session} />
            </CustomerRoute>
          }
        />

        <Route
          path="/restaurant/:restaurantId/contact"
          element={
            <CustomerRoute>
              <Contact />
            </CustomerRoute>
          }
        />

        <Route
          path="/restaurant/:restaurantId/status"
          element={
            <CustomerRoute>
              <Status />
            </CustomerRoute>
          }
        />

        <Route
          path="/owner/login"
          element={(
            <AuthLayout>
              <AdminLogin onLogin={setOwnerAuth} isAdmin={Boolean(ownerAuth?.token)} mode="owner" />
            </AuthLayout>
          )}
        />
        <Route
          path="/owner/register"
          element={(
            <AuthLayout>
              <OwnerRegister onLogin={setOwnerAuth} isAdmin={Boolean(ownerAuth?.token)} />
            </AuthLayout>
          )}
        />

        <Route
          path="/admin/login"
          element={(
            <AuthLayout>
              <AdminLogin onLogin={setAdminAuth} isAdmin={Boolean(adminAuth)} mode="admin" />
            </AuthLayout>
          )}
        />
        <Route
          path="/admin/restaurants"
          element={
            adminAuth
              ? <AdminRestaurants token={adminAuth} />
              : <Navigate to="/admin/login" replace />
          }
        />
        <Route
          path="/admin/restaurants/new"
          element={
            adminAuth
              ? <AdminCreateRestaurant />
              : <Navigate to="/admin/login" replace />
          }
        />

        <Route
          path="/owner/home"
          element={
            <OwnerRoute auth={ownerAuth}>
              <AdminHome onLogout={handleOwnerLogout} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/orders"
          element={
            <OwnerRoute auth={ownerAuth}>
              <AdminOrders token={ownerAuth?.token} restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/tables"
          element={
            <OwnerRoute auth={ownerAuth}>
              <TablesDashboard token={ownerAuth?.token} restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/products"
          element={
            <OwnerRoute auth={ownerAuth}>
              <MenuManagement token={ownerAuth?.token} mode="manage" restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/products/add"
          element={
            <OwnerRoute auth={ownerAuth}>
              <AddProduct token={ownerAuth?.token} restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/products/edit"
          element={
            <OwnerRoute auth={ownerAuth}>
              <MenuManagement token={ownerAuth?.token} mode="edit" restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />
        <Route
          path="/owner/products/:id"
          element={
            <OwnerRoute auth={ownerAuth}>
              <EditProduct token={ownerAuth?.token} restaurantId={ownerAuth?.restaurant?.id} />
            </OwnerRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>

      <Footer />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
