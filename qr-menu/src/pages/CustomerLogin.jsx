import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import "./CustomerLogin.css";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { buildCustomerRoute, readTableNumberFromSearch } from "../utils/customerRouting";

const API_BASE = import.meta.env.VITE_API_URL;

export default function CustomerLogin({ onLogin, session }) {

  const params = useParams();
  const location = useLocation();
  const restaurantId = params.restaurantId;
  const paramsTable = useMemo(() => {
    return readTableNumberFromSearch(location.search, null);
  }, [location.search]);

  const { setSession } = useCustomerSession();

  const [form, setForm] = useState({
    customerName: "",
    phoneNumber: ""
  });

  const [error, setError] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [tableInfo, setTableInfo] = useState({
    loading: Boolean(paramsTable),
    tableExists: paramsTable ? null : false,
    tableStatus: "unknown"
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (session) {
      navigate(buildCustomerRoute(restaurantId, "items", { tableNumber: paramsTable }), { replace: true });
    }
  }, [session, navigate, restaurantId, paramsTable]);

  useEffect(() => {
    let active = true;
    async function loadRestaurant() {
      try {
        const res = await fetch(`${API_BASE}/api/restaurants/${restaurantId}`);
        if (!active) return;
        if (!res.ok) {
          setError("Restaurant not found.");
          navigate("/", { replace: true });
          return;
        }
        const data = await res.json();
        setRestaurantName(data.name || "");
      } catch {
        if (!active) return;
        setError("Unable to load restaurant details.");
      }
    }

    if (restaurantId) {
      loadRestaurant();
    }

    return () => {
      active = false;
    };
  }, [restaurantId, navigate]);

  useEffect(() => {
    async function checkTable() {
      if (!paramsTable) return;
      setTableInfo(prev => ({ ...prev, loading: true }));
      try {
        const res = await fetch(`${API_BASE}/api/customer/session/${paramsTable}?restaurantId=${restaurantId}`);
        const data = await res.json();

        setTableInfo({
          loading: false,
          tableExists: data.tableExists !== false,
          tableStatus: data.tableStatus || (data.active ? "occupied" : "free"),
          active: Boolean(data.active)
        });

        if (data.tableExists === false) {
          setError("Invalid table QR code.");
        } else if (data.tableStatus === "occupied" || data.active) {
          setError("This table is currently in use.");
        } else {
          setError("");
        }
      } catch {
        setTableInfo(prev => ({ ...prev, loading: false }));
        setError("Unable to verify table. Please retry.");
      }
    }

    checkTable();
  }, [paramsTable, restaurantId]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!paramsTable || tableInfo.tableExists === false) {
      setError("Invalid table QR code.");
      return;
    }
    if (tableInfo.tableStatus === "occupied" || tableInfo.active) {
      setError("This table is currently in use.");
      return;
    }
    setError("");

    const payload = {
      restaurantId,
      tableNumber: paramsTable,
      customerName: form.customerName.trim(),
      phoneNumber: form.phoneNumber.trim()
    };

    if (!payload.customerName || !payload.phoneNumber) {
      setError("Please fill in all fields.");
      return;
    }

    try {

      const res = await fetch(`${API_BASE}/api/customer/session/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Unable to start session.");
      }

      const newSession = {
        restaurantId,
        tableNumber: data.tableNumber,
        customerName: data.customerName,
        phoneNumber: data.phoneNumber,
        sessionId: data.sessionId,
        restaurantName: restaurantName || data.restaurantName || ""
      };

      setSession(newSession);
      onLogin?.(newSession);

      navigate(buildCustomerRoute(restaurantId, "items", { tableNumber: paramsTable }), { replace: true });

    } catch (err) {
      setError(err.message);
    }
  }

  return (

    <div className="login-page">

      <div className="login-overlay"></div>

      <div className="login-card">

        <h1>Start Your Order</h1>
        <p className="login-subtext">
          {!paramsTable || tableInfo.tableExists === false
            ? "Scan the QR at your table to continue."
            : tableInfo.tableStatus === "occupied" || tableInfo.active
              ? "This table is currently in use."
              : "Welcome to Hotel Menu\nPlease enter your details to start ordering"}
        </p>

        {paramsTable && (
          <p className="muted" style={{ marginBottom: "8px" }}>
            Table: <strong>{paramsTable}</strong> • Restaurant: <strong>{restaurantName || "Loading..."}</strong>
          </p>
        )}

        {error && <p className="login-error">{error}</p>}

        <form className="login-form" onSubmit={handleSubmit}>

          <label>
            Name
            <input
              type="text"
              name="customerName"
              value={form.customerName}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Phone Number
            <input
              type="tel"
              name="phoneNumber"
              value={form.phoneNumber}
              onChange={handleChange}
              required
            />
          </label>

          <button
            type="submit"
            className="login-btn"
            disabled={
              !paramsTable ||
              tableInfo.tableExists === false ||
              tableInfo.tableStatus === "occupied" ||
              tableInfo.active ||
              tableInfo.loading
            }
          >
            Start Ordering
          </button>

          <p className="login-note">
            Only one active session per table. If your table is occupied, please ask the staff.
          </p>

        </form>

      </div>

    </div>
  );
}
