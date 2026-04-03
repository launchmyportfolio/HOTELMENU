import { useNavigate } from "react-router-dom";
import { useNotifications } from "../context/NotificationContext";
import {
  formatNotificationTimeAgo,
  getNotificationIcon,
  getPriorityClass,
  resolveNotificationRedirect
} from "../utils/notificationUtils";

export default function NotificationToasts() {
  const {
    actor,
    toasts,
    markAsRead,
    dismissToast
  } = useNotifications() || {};
  const navigate = useNavigate();
  const toastList = Array.isArray(toasts) ? toasts : [];

  async function handleGoToOrders(item) {
    if (!item) return;
    if (item._id && !String(item._id).startsWith("local-") && !item.isRead) {
      await markAsRead?.(item._id, true, item.targetRole);
    }
    dismissToast?.(item.toastId);
    navigate(resolveNotificationRedirect(item, actor));
  }

  function handleIgnore(item) {
    dismissToast?.(item.toastId);
  }

  if (!toastList.length) return null;

  return (
    <div className="notification-toast-stack" aria-live="assertive" aria-atomic="true">
      {toastList.map(item => (
        <article
          key={item.toastId || item._id}
          className={`notification-toast ${getPriorityClass(item.priority)} ${String(item.priority || "").toUpperCase() === "CRITICAL" ? "critical-shake" : ""} ${String(item.type || "").toUpperCase() === "NEW_ORDER" ? "new-order-toast" : ""}`}
          onClick={() => {
            if (String(item.type || "").toUpperCase() === "NEW_ORDER") {
              handleGoToOrders(item);
            }
          }}
        >
          <div className="notification-toast-icon">{getNotificationIcon(item.type)}</div>
          <div className="notification-toast-body">
            <p className="notification-toast-title">{item.title}</p>
            <p className="notification-toast-message">{item.message}</p>
            <div className="notification-toast-details">
              {item.orderId && <span>Order #{String(item.orderId).slice(-8)}</span>}
              {(item.tableNumber || item.tableNumber === 0) && <span>Table {item.tableNumber}</span>}
              {(item.metadata?.totalAmount || item.totalAmount || item.amount) && <span>Total ₹{item.metadata?.totalAmount || item.totalAmount || item.amount}</span>}
            </div>
            <span className="notification-toast-time">{formatNotificationTimeAgo(item.updatedAt || item.createdAt)}</span>
            {String(item.type || "").toUpperCase() === "NEW_ORDER" && (
              <div className="notification-toast-actions">
                <button
                  type="button"
                  className="toast-cta-btn"
                  onClick={event => {
                    event.stopPropagation();
                    handleGoToOrders(item);
                  }}
                >
                  Go to Orders
                </button>
                <button
                  type="button"
                  className="toast-ignore-btn"
                  onClick={event => {
                    event.stopPropagation();
                    handleIgnore(item);
                  }}
                >
                  Ignore
                </button>
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
