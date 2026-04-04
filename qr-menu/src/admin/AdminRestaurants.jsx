import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../utils/apiBase";
import "../styles/Admin.css";

const FILTER_OPTIONS = [
  { label: "All", value: "" },
  { label: "Pending Approval", value: "PENDING_APPROVAL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Inactive", value: "INACTIVE" },
  { label: "Suspended", value: "SUSPENDED" },
  { label: "Expired", value: "EXPIRED" },
  { label: "Rejected", value: "REJECTED" }
];

const PAYMENT_FILTER_OPTIONS = [
  { label: "All Payments", value: "" },
  { label: "Paid", value: "PAID" },
  { label: "Unpaid", value: "UNPAID" },
  { label: "Pending", value: "PENDING" }
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function buildStatusClass(value = "") {
  return String(value || "").trim().toLowerCase().replace(/_/g, "-");
}

function createSubscriptionDraft(restaurant = null) {
  return {
    subscriptionPlan: restaurant?.subscriptionPlan || "BASIC",
    planType: restaurant?.planType || "MONTHLY",
    subscriptionStartDate: restaurant?.subscriptionStartDate ? String(restaurant.subscriptionStartDate).slice(0, 10) : "",
    subscriptionEndDate: restaurant?.subscriptionEndDate ? String(restaurant.subscriptionEndDate).slice(0, 10) : ""
  };
}

export default function AdminRestaurants({ token }) {
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState(null);
  const [subscriptionDraft, setSubscriptionDraft] = useState(createSubscriptionDraft());
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter) params.set("restaurantStatus", statusFilter);
    if (paymentFilter) params.set("subscriptionStatus", paymentFilter);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [search, statusFilter, paymentFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/restaurants${queryString}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load restaurants");
      setRestaurants(Array.isArray(data.restaurants) ? data.restaurants : []);
      setError("");
    } catch (err) {
      setError(err.message);
      setRestaurants([]);
    } finally {
      setLoading(false);
    }
  }, [queryString, token]);

  useEffect(() => {
    if (!token) return;
    load();
  }, [token, load]);

  async function runAction(endpoint, payload, successMessage) {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || successMessage || "Update failed");
      setError("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleApproval(restaurant, approvalStatus) {
    const rejectionReason = approvalStatus === "REJECTED"
      ? window.prompt("Enter rejection reason", restaurant.rejectionReason || "") || ""
      : "";

    await runAction(
      `/api/admin/restaurants/${restaurant._id}/approval`,
      { approvalStatus, rejectionReason },
      `Unable to ${approvalStatus === "APPROVED" ? "approve" : "reject"} restaurant`
    );
  }

  async function handleStatusChange(restaurant, restaurantStatus) {
    await runAction(
      `/api/admin/restaurants/${restaurant._id}/status`,
      { restaurantStatus },
      "Unable to update restaurant status"
    );
  }

  async function handlePaymentStatus(restaurant, subscriptionStatus) {
    await runAction(
      `/api/admin/restaurants/${restaurant._id}/payment`,
      {
        subscriptionStatus,
        subscriptionPlan: restaurant.subscriptionPlan,
        planType: restaurant.planType,
        periodStartDate: restaurant.subscriptionStartDate,
        periodEndDate: restaurant.subscriptionEndDate,
        lastPaymentDate: subscriptionStatus === "PAID" ? new Date().toISOString() : null,
        notes: `Marked ${subscriptionStatus.toLowerCase()} by super admin`
      },
      "Unable to update subscription payment"
    );
  }

  async function openSubscriptionModal(restaurant) {
    setSelectedRestaurant(restaurant);
    setSubscriptionDraft(createSubscriptionDraft(restaurant));
    setSubscriptionModalOpen(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/restaurants/${restaurant._id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.restaurant) {
        setSelectedRestaurant(data.restaurant);
        setSubscriptionDraft(createSubscriptionDraft(data.restaurant));
      }
    } catch {
      // best-effort refresh only
    }
  }

  async function saveSubscription() {
    if (!selectedRestaurant) return;
    await runAction(
      `/api/admin/restaurants/${selectedRestaurant._id}/subscription`,
      subscriptionDraft,
      "Unable to update subscription"
    );
    setSubscriptionModalOpen(false);
    setSelectedRestaurant(null);
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this restaurant?")) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/restarents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const totals = useMemo(() => ({
    total: restaurants.length,
    pending: restaurants.filter(item => item.effectiveStatus === "PENDING_APPROVAL").length,
    active: restaurants.filter(item => item.effectiveStatus === "ACTIVE").length,
    unpaid: restaurants.filter(item => item.subscriptionStatus === "UNPAID").length
  }), [restaurants]);

  return (
    <div className="admin-dashboard">
      <h1>Restaurant Management</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="tables-summary">
        <div className="summary-card highlight">Total: {totals.total}</div>
        <div className="summary-card">Pending Approval: {totals.pending}</div>
        <div className="summary-card">Active: {totals.active}</div>
        <div className="summary-card">Unpaid: {totals.unpaid}</div>
      </div>

      <div className="table-controls admin-restaurants-controls">
        <input
          type="text"
          placeholder="Search by restaurant, owner, email, phone"
          value={search}
          onChange={event => setSearch(event.target.value)}
          className="table-search"
        />
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          {FILTER_OPTIONS.map(option => (
            <option key={option.value || "all-status"} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select value={paymentFilter} onChange={event => setPaymentFilter(event.target.value)}>
          {PAYMENT_FILTER_OPTIONS.map(option => (
            <option key={option.value || "all-payment"} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="table-list admin-restaurants-list">
        <div className="table-row table-head admin-restaurants-head" style={{ gridTemplateColumns: "1.4fr 1fr 1.1fr 0.9fr 0.9fr 0.9fr 0.9fr 1.8fr" }}>
          <span>Restaurant</span>
          <span>Owner</span>
          <span>Contact</span>
          <span>Approval</span>
          <span>Status</span>
          <span>Payment</span>
          <span>Plan</span>
          <span>Actions</span>
        </div>

        {restaurants.map(restaurant => (
          <div
            key={restaurant._id}
            className="table-row admin-restaurants-row"
            style={{ gridTemplateColumns: "1.4fr 1fr 1.1fr 0.9fr 0.9fr 0.9fr 0.9fr 1.8fr", alignItems: "start" }}
          >
            <span data-label="Restaurant">
              <strong>{restaurant.name}</strong>
              <div className="muted">{restaurant.address || "No address"}</div>
              <div className="muted">Registered: {formatDate(restaurant.createdAt)}</div>
            </span>
            <span data-label="Owner">{restaurant.ownerName || "—"}</span>
            <span data-label="Contact">
              <div>{restaurant.email}</div>
              <div className="muted">{restaurant.phone || "—"}</div>
            </span>
            <span data-label="Approval" className={`status-pill ${buildStatusClass(restaurant.approvalStatus)}`}>{restaurant.approvalStatus}</span>
            <span data-label="Status" className={`status-pill ${buildStatusClass(restaurant.effectiveStatus)}`}>{restaurant.effectiveStatus}</span>
            <span data-label="Payment" className={`payment-pill ${buildStatusClass(restaurant.subscriptionStatus)}`}>{restaurant.subscriptionStatus}</span>
            <span data-label="Plan">
              <div>{restaurant.subscriptionPlan}</div>
              <div className="muted">{restaurant.planType}</div>
              <div className="muted">{formatDate(restaurant.subscriptionEndDate)}</div>
            </span>
            <span data-label="Actions" className="table-actions admin-restaurants-actions">
              {restaurant.approvalStatus !== "APPROVED" && (
                <button type="button" onClick={() => handleApproval(restaurant, "APPROVED")} disabled={saving}>
                  Approve
                </button>
              )}
              {restaurant.approvalStatus !== "REJECTED" && (
                <button type="button" className="ghost-btn" onClick={() => handleApproval(restaurant, "REJECTED")} disabled={saving}>
                  Reject
                </button>
              )}
              {restaurant.effectiveStatus !== "ACTIVE" && restaurant.approvalStatus === "APPROVED" && (
                <button type="button" onClick={() => handleStatusChange(restaurant, "ACTIVE")} disabled={saving}>
                  Activate
                </button>
              )}
              {restaurant.effectiveStatus === "ACTIVE" && (
                <button type="button" className="ghost-btn" onClick={() => handleStatusChange(restaurant, "INACTIVE")} disabled={saving}>
                  Deactivate
                </button>
              )}
              {restaurant.effectiveStatus !== "SUSPENDED" && restaurant.approvalStatus === "APPROVED" && (
                <button type="button" className="danger" onClick={() => handleStatusChange(restaurant, "SUSPENDED")} disabled={saving}>
                  Suspend
                </button>
              )}
              {restaurant.subscriptionStatus !== "PAID" && (
                <button type="button" onClick={() => handlePaymentStatus(restaurant, "PAID")} disabled={saving}>
                  Mark Paid
                </button>
              )}
              {restaurant.subscriptionStatus !== "UNPAID" && (
                <button type="button" className="ghost-btn" onClick={() => handlePaymentStatus(restaurant, "UNPAID")} disabled={saving}>
                  Mark Unpaid
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={() => openSubscriptionModal(restaurant)} disabled={saving}>
                Edit Subscription
              </button>
              <button type="button" className="danger" onClick={() => handleDelete(restaurant._id)} disabled={saving}>
                Delete
              </button>
            </span>
          </div>
        ))}

        {!loading && restaurants.length === 0 && !error && (
          <p className="info-text" style={{ textAlign: "center", padding: "16px" }}>
            No restaurants found for the selected filters.
          </p>
        )}

        {loading && (
          <p className="info-text" style={{ textAlign: "center", padding: "16px" }}>
            Loading restaurants...
          </p>
        )}
      </div>

      {subscriptionModalOpen && selectedRestaurant && (
        <div className="payment-editor-overlay" onClick={() => setSubscriptionModalOpen(false)}>
          <div className="payment-editor-modal glass-card" onClick={event => event.stopPropagation()}>
            <h3>Edit Subscription</h3>

            <label className="setting-field">
              <span>Plan</span>
              <select
                value={subscriptionDraft.subscriptionPlan}
                onChange={event => setSubscriptionDraft(prev => ({ ...prev, subscriptionPlan: event.target.value }))}
              >
                <option value="BASIC">Basic</option>
                <option value="PREMIUM">Premium</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </label>

            <label className="setting-field">
              <span>Billing Cycle</span>
              <select
                value={subscriptionDraft.planType}
                onChange={event => setSubscriptionDraft(prev => ({ ...prev, planType: event.target.value }))}
              >
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </label>

            <label className="setting-field">
              <span>Subscription Start Date</span>
              <input
                type="date"
                value={subscriptionDraft.subscriptionStartDate}
                onChange={event => setSubscriptionDraft(prev => ({ ...prev, subscriptionStartDate: event.target.value }))}
              />
            </label>

            <label className="setting-field">
              <span>Subscription End Date</span>
              <input
                type="date"
                value={subscriptionDraft.subscriptionEndDate}
                onChange={event => setSubscriptionDraft(prev => ({ ...prev, subscriptionEndDate: event.target.value }))}
              />
            </label>

            <div className="payment-editor-actions">
              <button type="button" className="ghost-btn" onClick={() => setSubscriptionModalOpen(false)}>Cancel</button>
              <button type="button" onClick={saveSubscription} disabled={saving}>Save Subscription</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
