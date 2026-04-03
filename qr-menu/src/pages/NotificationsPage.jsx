import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import { formatNotificationTimeAgo, getNotificationIcon, getPriorityClass } from "../utils/notificationUtils";
import { buildCustomerRoute, readTableNumberFromSearch } from "../utils/customerRouting";

export default function NotificationsPage() {
  const {
    actor,
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    removeNotification,
    refreshNotifications
  } = useNotifications() || {};
  const location = useLocation();
  const navigate = useNavigate();

  const queryType = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const fromQuery = String(params.get("type") || "").trim().toUpperCase();
    if (fromQuery.startsWith("BOOKING")) {
      return "BOOKING";
    }
    return fromQuery;
  }, [location.search]);

  const [filters, setFilters] = useState({
    unreadOnly: false,
    highOnly: false,
    type: queryType,
    orderId: "",
    tableNumber: ""
  });

  const list = useMemo(() => {
    let data = Array.isArray(notifications) ? notifications : [];
    const activeType = queryType || filters.type;

    if (filters.unreadOnly) {
      data = data.filter(item => !item.isRead);
    }

    if (filters.highOnly) {
      data = data.filter(item => {
        const priority = String(item.priority || "").toUpperCase();
        return priority === "HIGH" || priority === "CRITICAL";
      });
    }

    if (activeType) {
      const normalized = activeType.toUpperCase();
      data = data.filter(item => {
        const type = String(item.type || "").toUpperCase();
        if (normalized === "BOOKING") return type.startsWith("BOOKING_");
        return type === normalized;
      });
    }

    if (filters.orderId.trim()) {
      data = data.filter(item => String(item.orderId || "").includes(filters.orderId.trim()));
    }

    if (filters.tableNumber.trim()) {
      data = data.filter(item => String(item.tableNumber || "").includes(filters.tableNumber.trim()));
    }

    return data;
  }, [notifications, filters, queryType]);

  const allTypes = useMemo(() => {
    const set = new Set();
    (notifications || []).forEach(item => {
      if (item.type) set.add(String(item.type).toUpperCase());
    });
    if (queryType === "BOOKING") set.add("BOOKING");
    return [...set].sort();
  }, [notifications, queryType]);

  const backToUrl = useMemo(() => {
    const fromState = String(location.state?.backTo || "").trim();
    const fromQuery = String(new URLSearchParams(location.search).get("backTo") || "").trim();
    const candidate = fromState || fromQuery;
    if (candidate.startsWith("/")) {
      return candidate;
    }

    if (actor?.kind === "CUSTOMER" && actor?.restaurantId) {
      const tableNumber = readTableNumberFromSearch(location.search, actor?.tableNumber || null);
      return buildCustomerRoute(actor.restaurantId, "status", { tableNumber });
    }

    if (actor?.kind === "OWNER") {
      return "/owner/home";
    }

    return "/";
  }, [actor, location.search, location.state]);

  if (!actor) return null;

  return (
    <section className="notifications-page">
      <div className="notifications-page-overlay" />
      <div className="notifications-page-content glass-panel">
        <div className="notifications-header">
          <div>
            <h1>Notification Center</h1>
            <p>
              Role: <strong>{actor.role || actor.kind}</strong> • Unread: <strong>{unreadCount || 0}</strong>
            </p>
          </div>
          <div className="notifications-header-actions">
            <button type="button" onClick={() => navigate(backToUrl)}>
              Back
            </button>
            <button type="button" onClick={() => refreshNotifications?.()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button type="button" onClick={() => markAllAsRead?.(true)} disabled={!list.length || unreadCount === 0}>
              Mark all read
            </button>
          </div>
        </div>

        <div className="notifications-filters">
          <label>
            <input
              type="checkbox"
              checked={filters.unreadOnly}
              onChange={event => setFilters(prev => ({ ...prev, unreadOnly: event.target.checked }))}
            />
            Unread only
          </label>
          <label>
            <input
              type="checkbox"
              checked={filters.highOnly}
              onChange={event => setFilters(prev => ({ ...prev, highOnly: event.target.checked }))}
            />
            High priority
          </label>
          <label>
            Type
            <select
              value={queryType || filters.type}
              onChange={event => setFilters(prev => ({ ...prev, type: event.target.value }))}
            >
              <option value="">All</option>
              {allTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label>
            Order ID
            <input
              type="text"
              value={filters.orderId}
              onChange={event => setFilters(prev => ({ ...prev, orderId: event.target.value }))}
              placeholder="Filter by order"
            />
          </label>
          <label>
            Table
            <input
              type="text"
              value={filters.tableNumber}
              onChange={event => setFilters(prev => ({ ...prev, tableNumber: event.target.value }))}
              placeholder="Filter by table"
            />
          </label>
        </div>

        <div className="notifications-full-list">
          {!list.length && (
            <p className="notification-empty">No notifications match the selected filters.</p>
          )}

          {list.map(item => (
            <article
              key={item._id}
              className={`notification-row ${item.isRead ? "read" : "unread"} ${getPriorityClass(item.priority)}`}
            >
              <div className="notification-row-icon">{getNotificationIcon(item.type)}</div>
              <div className="notification-row-body">
                <h3>{item.title}</h3>
                <p>{item.message}</p>
                <div className="notification-row-meta">
                  <span>Type: {item.type}</span>
                  <span>Priority: {item.priority}</span>
                  {item.orderId && <span>Order: {item.orderId}</span>}
                  {(item.tableNumber || item.tableNumber === 0) && <span>Table: {item.tableNumber}</span>}
                  <span>{formatNotificationTimeAgo(item.updatedAt || item.createdAt)}</span>
                </div>
              </div>
              <div className="notification-row-actions">
                {!item.isRead && (
                  <button type="button" onClick={() => markAsRead?.(item._id, true, item.targetRole)}>
                    Mark read
                  </button>
                )}
                {actor.kind === "OWNER" && (
                  <button type="button" className="danger-btn" onClick={() => removeNotification?.(item._id, item.targetRole)}>
                    Delete
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
