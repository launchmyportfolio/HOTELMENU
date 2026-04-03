export const PRIORITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export const TYPE_ICON_MAP = {
  NEW_ORDER: "🧾",
  ORDER_ACCEPTED: "✅",
  ORDER_REJECTED: "⛔",
  ORDER_PREPARING: "🍳",
  ORDER_READY: "🔔",
  ORDER_SERVED: "🍽",
  PAYMENT_SUCCESS: "💳",
  PAYMENT_FAILED: "⚠",
  TABLE_OCCUPIED: "🪑",
  TABLE_AVAILABLE: "🟢",
  BOOKING_CREATED: "📅",
  BOOKING_CONFIRMED: "✅",
  BOOKING_CANCELLED: "❌",
  WAITER_CALLED: "🙋",
  SYSTEM_ALERT: "📣"
};

export function getNotificationIcon(type) {
  return TYPE_ICON_MAP[String(type || "").toUpperCase()] || "🔔";
}

export function getPriorityClass(priority) {
  const normalized = String(priority || "LOW").toLowerCase();
  if (["low", "medium", "high", "critical"].includes(normalized)) {
    return `priority-${normalized}`;
  }
  return "priority-low";
}

export function formatNotificationTime(createdAt) {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function getNotificationTimestamp(notification) {
  const date = new Date(notification?.updatedAt || notification?.createdAt || 0);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

export function formatNotificationTimeAgo(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = date.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absSeconds < 60) return rtf.format(diffSeconds, "second");
  if (absSeconds < 60 * 60) return rtf.format(Math.round(diffSeconds / 60), "minute");
  if (absSeconds < 60 * 60 * 24) return rtf.format(Math.round(diffSeconds / (60 * 60)), "hour");
  return rtf.format(Math.round(diffSeconds / (60 * 60 * 24)), "day");
}

export function getNotificationThreadKey(notification) {
  if (!notification) return "";
  const role = String(notification.targetRole || "").toUpperCase();
  const uniqueKey = String(notification.uniqueKey || "").trim();
  if (uniqueKey) return `${role}:${uniqueKey}`;
  if (notification._id) return `id:${notification._id}`;
  return `${role}:${String(notification.type || "")}:${String(notification.orderId || "")}:${String(notification.tableNumber || "")}:${String(notification.createdAt || "")}`;
}

export function dedupeAndSortNotifications(list = []) {
  const map = new Map();

  list.forEach(item => {
    const key = getNotificationThreadKey(item);
    if (!key) return;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, item);
      return;
    }

    const existingTime = getNotificationTimestamp(existing);
    const nextTime = getNotificationTimestamp(item);
    if (nextTime >= existingTime) {
      map.set(key, { ...existing, ...item });
    } else {
      map.set(key, { ...item, ...existing });
    }
  });

  return [...map.values()].sort((a, b) => getNotificationTimestamp(b) - getNotificationTimestamp(a));
}

export function resolveNotificationRedirect(notification, actor) {
  if (!notification) return "/notifications";
  if (notification.redirectUrl) return notification.redirectUrl;

  const type = String(notification.type || "").toUpperCase();
  const tableNumber = notification.tableNumber;
  const orderId = notification.orderId;
  const bookingId = notification.bookingId;
  const restaurantId = notification.restaurantId || actor?.restaurantId;
  const isCustomer = String(actor?.kind || "").toUpperCase() === "CUSTOMER";

  if (isCustomer) {
    if ((type === "NEW_ORDER" || type.startsWith("ORDER_") || type.startsWith("PAYMENT_")) && restaurantId && tableNumber) {
      const params = new URLSearchParams({ table: String(tableNumber) });
      if (orderId) params.set("orderId", String(orderId));
      return `/restaurant/${restaurantId}/status?${params.toString()}`;
    }
    if (type.startsWith("TABLE_") && restaurantId && tableNumber) {
      return `/restaurant/${restaurantId}?table=${tableNumber}`;
    }
    return "/notifications";
  }

  if (type === "NEW_ORDER" || type.startsWith("ORDER_") || type.startsWith("PAYMENT_")) {
    if (orderId) {
      return `/owner/orders?highlightOrder=${encodeURIComponent(orderId)}`;
    }
    return "/owner/orders";
  }

  if (type.startsWith("TABLE_") || type === "WAITER_CALLED") {
    if (tableNumber !== undefined && tableNumber !== null) {
      return `/owner/tables?highlightTable=${encodeURIComponent(String(tableNumber))}`;
    }
    return "/owner/tables";
  }

  if (type.startsWith("BOOKING_")) {
    if (bookingId) {
      return `/notifications?type=BOOKING&bookingId=${encodeURIComponent(String(bookingId))}`;
    }
    return "/notifications?type=BOOKING";
  }

  return "/notifications";
}

export function isHighPriority(priority) {
  const normalized = String(priority || "").toUpperCase();
  return normalized === "HIGH" || normalized === "CRITICAL";
}

export function mapTypeToStatus(type) {
  const normalized = String(type || "").toUpperCase();
  if (normalized === "NEW_ORDER" || normalized === "ORDER_ACCEPTED") return "received";
  if (normalized === "ORDER_PREPARING") return "preparing";
  if (normalized === "ORDER_READY") return "ready";
  if (normalized === "ORDER_SERVED") return "served";
  if (normalized === "PAYMENT_SUCCESS") return "completed";
  return "";
}
