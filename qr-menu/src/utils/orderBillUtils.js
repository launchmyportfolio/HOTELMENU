export function getBillItems(order) {
  if (Array.isArray(order?.billItems) && order.billItems.length) {
    return order.billItems;
  }
  if (Array.isArray(order?.items)) {
    return order.items;
  }
  return [];
}

export function normalizeItemStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "COOKING") return "Preparing";
  if (key === "COMPLETED") return "Served";
  if (!key) return "Pending";
  return `${key.slice(0, 1)}${key.slice(1).toLowerCase()}`;
}

