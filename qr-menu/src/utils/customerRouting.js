export function parsePositiveTableNumber(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return fallback;
  }
  return number;
}

export function readTableNumberFromSearch(search = "", fallback = null) {
  const params = new URLSearchParams(search || "");
  return parsePositiveTableNumber(params.get("table"), fallback);
}

function normalizeOrigin(value = "") {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function resolvePublicAppOrigin() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return normalizeOrigin(window.location.origin);
  }

  return normalizeOrigin(import.meta.env.VITE_PUBLIC_MENU_URL || "");
}

export function buildCustomerRoute(restaurantId, path = "", options = {}) {
  const rid = String(restaurantId || "").trim();
  const normalizedPath = String(path || "").trim().replace(/^\/+/, "");
  const routePath = normalizedPath ? `/restaurant/${rid}/${normalizedPath}` : `/restaurant/${rid}`;
  const params = new URLSearchParams();

  const tableNumber = parsePositiveTableNumber(options.tableNumber, null);
  if (tableNumber) {
    params.set("table", String(tableNumber));
  }

  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `${routePath}?${query}` : routePath;
}

export function buildCustomerEntryRoute(restaurantId, options = {}) {
  const rid = String(restaurantId || "").trim();
  const params = new URLSearchParams();
  const tableNumber = parsePositiveTableNumber(options.tableNumber, null);

  if (rid) {
    params.set("restaurantId", rid);
  }

  if (tableNumber) {
    params.set("table", String(tableNumber));
  }

  Object.entries(options.query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.set(key, String(value));
  });

  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function buildCustomerEntryUrl(restaurantId, options = {}) {
  const origin = normalizeOrigin(options.origin || resolvePublicAppOrigin());
  const route = buildCustomerEntryRoute(restaurantId, options);
  return origin ? `${origin}${route}` : route;
}

export function buildNotificationsRoute(options = {}) {
  const params = new URLSearchParams();
  const tableNumber = parsePositiveTableNumber(options.tableNumber, null);

  if (options.restaurantId) {
    params.set("restaurantId", String(options.restaurantId));
  }

  if (tableNumber) {
    params.set("table", String(tableNumber));
  }

  if (options.backTo) {
    params.set("backTo", String(options.backTo));
  }

  const query = params.toString();
  return query ? `/notifications?${query}` : "/notifications";
}

export function buildPaymentSuccessRoute(restaurantId, options = {}) {
  const params = new URLSearchParams();
  const tableNumber = parsePositiveTableNumber(options.tableNumber, null);

  if (options.orderId) {
    params.set("orderId", String(options.orderId));
  }
  if (options.receiptId) {
    params.set("receiptId", String(options.receiptId));
  }
  if (options.token) {
    params.set("token", String(options.token));
  }
  if (tableNumber) {
    params.set("table", String(tableNumber));
  }

  const query = params.toString();
  return query
    ? `/restaurant/${String(restaurantId || "").trim()}/payment-success?${query}`
    : `/restaurant/${String(restaurantId || "").trim()}/payment-success`;
}

export function buildReceiptRoute(restaurantId, receiptId, options = {}) {
  const params = new URLSearchParams();
  if (options.token) {
    params.set("token", String(options.token));
  }
  if (options.print === true) {
    params.set("print", "1");
  }

  const query = params.toString();
  const path = `/restaurant/${String(restaurantId || "").trim()}/receipt/${String(receiptId || "").trim()}`;
  return query ? `${path}?${query}` : path;
}
