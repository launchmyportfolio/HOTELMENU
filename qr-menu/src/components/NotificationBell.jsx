import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import {
  formatNotificationTimeAgo,
  getNotificationIcon,
  getPriorityClass,
  resolveNotificationRedirect
} from "../utils/notificationUtils";
import { buildNotificationsRoute } from "../utils/customerRouting";

export default function NotificationBell() {
  const {
    actor,
    notifications,
    unreadCount,
    isBellOpen,
    soundEnabled,
    setSoundEnabled,
    setIsBellOpen,
    markAsRead,
    markAllAsRead
  } = useNotifications() || {};

  const navigate = useNavigate();
  const panelRef = useRef(null);
  const currentPath = typeof window !== "undefined"
    ? `${window.location.pathname}${window.location.search}`
    : "/";

  const latest = Array.isArray(notifications) ? notifications.slice(0, 12) : [];

  async function handleNotificationClick(item) {
    if (!item) return;
    if (!item.isRead) {
      await markAsRead?.(item._id, true, item.targetRole);
    }
    setIsBellOpen?.(false);
    const redirectUrl = resolveNotificationRedirect(item, actor);
    if (redirectUrl) {
      navigate(redirectUrl);
    }
  }

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target)) {
        setIsBellOpen?.(false);
      }
    }

    if (isBellOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isBellOpen, setIsBellOpen]);

  if (!actor) return null;

  const viewAllUrl = buildNotificationsRoute({
    restaurantId: actor.restaurantId,
    tableNumber: actor.tableNumber,
    backTo: currentPath
  });

  return (
    <div className="notification-bell-wrapper" ref={panelRef}>
      <button
        type="button"
        className="notification-bell-btn"
        aria-label="Open notifications"
        onClick={() => setIsBellOpen?.(!isBellOpen)}
      >
        <span className="notification-bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge" aria-live="polite">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isBellOpen && (
        <div className="notification-dropdown glass-panel">
          <div className="notification-dropdown-head">
            <div>
              <h4>Notifications</h4>
              <p>{actor.role || actor.kind}</p>
            </div>
            <label className="sound-toggle">
              <input
                type="checkbox"
                checked={Boolean(soundEnabled)}
                onChange={event => setSoundEnabled?.(event.target.checked)}
              />
              <span>Sound</span>
            </label>
          </div>

          <div className="notification-actions-row">
            <button
              type="button"
              className="ghost-mini-btn"
              onClick={() => markAllAsRead?.(true)}
              disabled={!latest.length || unreadCount === 0}
            >
              Mark all read
            </button>
            <Link className="ghost-mini-btn" to={viewAllUrl} state={{ backTo: currentPath }} onClick={() => setIsBellOpen?.(false)}>
              View all
            </Link>
          </div>

          <div className="notification-list">
            {!latest.length && (
              <p className="notification-empty">No notifications yet.</p>
            )}

            {latest.map(item => (
              <button
                type="button"
                key={item._id}
                className={`notification-item ${item.isRead ? "read" : "unread"} ${getPriorityClass(item.priority)}`}
                onClick={() => handleNotificationClick(item)}
              >
                <div className="notification-item-icon">{getNotificationIcon(item.type)}</div>
                <div className="notification-item-body">
                  <p className="notification-item-title">{item.title}</p>
                  <p className="notification-item-message">{item.message}</p>
                  <div className="notification-item-context">
                    {item.orderId && <span>Order #{String(item.orderId).slice(-8)}</span>}
                    {(item.tableNumber || item.tableNumber === 0) && <span>Table {item.tableNumber}</span>}
                  </div>
                  <div className="notification-item-meta">
                    <span>{String(item.priority || "LOW").toUpperCase()}</span>
                    <span>{formatNotificationTimeAgo(item.updatedAt || item.createdAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
