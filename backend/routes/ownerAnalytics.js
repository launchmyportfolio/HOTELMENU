const express = require("express");

const Order = require("../models/Order");
const verifyOwnerToken = require("../middleware/verifyOwnerToken");

const router = express.Router();

function toPositiveNumber(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return number;
}

function normalizePaymentStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PAID") return "SUCCESS";
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(key)) return key;
  return "PENDING";
}

function normalizeDateInput(value, endOfDay = false) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const date = new Date(raw.includes("T") ? raw : `${raw}${suffix}`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getRangeBounds(now = new Date()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const startOfWeek = new Date(startOfToday);
  const day = startOfWeek.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  startOfWeek.setDate(startOfWeek.getDate() + diff);

  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);
  return { startOfToday, startOfWeek, startOfMonth, now };
}

function isWithinRange(dateValue, from, to) {
  const date = new Date(dateValue || 0);
  if (Number.isNaN(date.getTime())) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function derivePaymentMode(order = {}) {
  const gateway = order.paymentGatewayResponse && typeof order.paymentGatewayResponse === "object"
    ? order.paymentGatewayResponse
    : {};
  const candidates = [
    gateway.razorpayMethod,
    gateway.method,
    gateway.acquirerData?.method,
    order.paymentMethod,
    order.paymentProvider
  ]
    .map(value => String(value || "").trim().toUpperCase())
    .filter(Boolean);

  if (candidates.some(value => value.includes("CASH"))) return "CASH";
  if (candidates.some(value => value.includes("UPI") || value.includes("VPA"))) return "UPI";
  if (candidates.some(value => value.includes("CARD") || value.includes("CREDIT") || value.includes("DEBIT"))) return "CARD";
  if (candidates.some(value => value.includes("NETBANKING") || value.includes("BANK"))) return "NETBANKING";
  if (candidates.some(value => value.includes("WALLET"))) return "WALLET";
  if (candidates.some(value => value.includes("RAZORPAY"))) return "OTHER_RAZORPAY";
  return "OTHER";
}

function buildBillItems(order = {}) {
  const items = Array.isArray(order.billItems) && order.billItems.length
    ? order.billItems
    : Array.isArray(order.items)
      ? order.items
      : [];
  return items.filter(item => String(item?.status || "").trim().toUpperCase() !== "CANCELLED");
}

function summarizeOrders(orders = [], range = {}) {
  const paidOrders = orders.filter(order => normalizePaymentStatus(order.paymentStatus) === "SUCCESS");
  const successfulInRange = paidOrders.filter(order => isWithinRange(order.paidAt || order.updatedAt || order.createdAt, range.from, range.to));
  const allInRange = orders.filter(order => isWithinRange(order.createdAt || order.updatedAt, range.from, range.to));

  const breakdownSeed = {
    CASH: 0,
    UPI: 0,
    CARD: 0,
    NETBANKING: 0,
    WALLET: 0,
    OTHER_RAZORPAY: 0,
    OTHER: 0
  };

  const mostOrderedMap = new Map();
  let totalRevenue = 0;
  let highestBill = 0;

  successfulInRange.forEach(order => {
    const amount = Number(order.payableTotal || order.total || 0);
    totalRevenue += amount;
    highestBill = Math.max(highestBill, amount);
    const mode = derivePaymentMode(order);
    breakdownSeed[mode] = Number((breakdownSeed[mode] + amount).toFixed(2));

    buildBillItems(order).forEach(item => {
      const key = String(item?.name || "").trim();
      if (!key) return;
      mostOrderedMap.set(key, (mostOrderedMap.get(key) || 0) + Math.max(1, Number(item?.qty || 1)));
    });
  });

  const mostOrderedEntry = [...mostOrderedMap.entries()].sort((a, b) => b[1] - a[1])[0] || null;
  const averageBillValue = successfulInRange.length ? totalRevenue / successfulInRange.length : 0;

  const chartBreakdown = Object.entries(breakdownSeed)
    .map(([method, amount]) => ({ method, amount: Number(amount.toFixed(2)) }))
    .filter(item => item.amount > 0);

  return {
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalOrders: allInRange.length,
    paidBills: successfulInRange.length,
    averageBillValue: Number(averageBillValue.toFixed(2)),
    highestBillAmount: Number(highestBill.toFixed(2)),
    mostOrderedItem: mostOrderedEntry ? { name: mostOrderedEntry[0], quantity: mostOrderedEntry[1] } : null,
    paymentBreakdown: chartBreakdown
  };
}

function formatTransaction(order = {}) {
  const items = buildBillItems(order).map(item => ({
    name: String(item?.name || ""),
    qty: Math.max(1, Number(item?.qty || 1)),
    price: Number(item?.price || 0),
    category: String(item?.category || "General")
  }));

  return {
    orderId: String(order._id),
    billNumber: String(order.billNumber || order.receiptNumber || `BILL-${String(order._id).slice(-6).toUpperCase()}`),
    receiptNumber: String(order.receiptNumber || ""),
    tableNumber: Number(order.tableNumber || 0),
    customerName: String(order.customerName || ""),
    amount: Number(order.payableTotal || order.total || 0),
    paymentMethod: String(order.paymentMethod || order.paymentProvider || ""),
    paymentMode: derivePaymentMode(order),
    paymentStatus: normalizePaymentStatus(order.paymentStatus),
    transactionId: String(order.transactionId || ""),
    razorpayOrderId: String(order.paymentGatewayResponse?.razorpayOrderId || ""),
    createdAt: order.createdAt,
    paidAt: order.paidAt || null,
    items
  };
}

async function loadRestaurantOrders(restaurantId) {
  return Order.find({ restaurantId })
    .sort({ paidAt: -1, createdAt: -1 })
    .lean();
}

router.get("/overview", verifyOwnerToken, async (req, res) => {
  try {
    const orders = await loadRestaurantOrders(req.owner.restaurantId);
    const now = new Date();
    const { startOfToday, startOfWeek, startOfMonth } = getRangeBounds(now);
    const customFrom = normalizeDateInput(req.query.from);
    const customTo = normalizeDateInput(req.query.to, true);

    const today = summarizeOrders(orders, { from: startOfToday, to: now });
    const week = summarizeOrders(orders, { from: startOfWeek, to: now });
    const month = summarizeOrders(orders, { from: startOfMonth, to: now });
    const custom = customFrom || customTo
      ? summarizeOrders(orders, { from: customFrom, to: customTo || now })
      : null;

    const paidBills = orders
      .filter(order => normalizePaymentStatus(order.paymentStatus) === "SUCCESS")
      .sort((a, b) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime())
      .slice(0, 150)
      .map(formatTransaction);

    return res.json({
      restaurant: {
        id: req.owner.restaurant.id,
        name: req.owner.restaurant.name,
        logoUrl: req.owner.restaurant.logoUrl || ""
      },
      metrics: {
        today,
        week,
        month,
        custom
      },
      paidBills
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unable to load analytics overview." });
  }
});

router.get("/payments", verifyOwnerToken, async (req, res) => {
  try {
    const allOrders = await loadRestaurantOrders(req.owner.restaurantId);
    const from = normalizeDateInput(req.query.from);
    const to = normalizeDateInput(req.query.to, true);
    const methodFilter = String(req.query.method || "").trim().toUpperCase();
    const tableFilter = Number(req.query.tableNumber || 0);
    const statusFilter = String(req.query.status || "").trim().toUpperCase();

    const filtered = allOrders.filter(order => {
      const paidReference = order.paidAt || order.createdAt || order.updatedAt;
      if (from && !isWithinRange(paidReference, from, to || null)) return false;
      if (to && !isWithinRange(paidReference, from || null, to)) return false;
      if (tableFilter > 0 && Number(order.tableNumber) !== tableFilter) return false;
      if (statusFilter && normalizePaymentStatus(order.paymentStatus) !== statusFilter) return false;
      if (methodFilter && derivePaymentMode(order) !== methodFilter) return false;
      return true;
    });

    const totals = filtered.reduce((acc, order) => {
      const amount = Number(order.payableTotal || order.total || 0);
      acc.totalAmount += normalizePaymentStatus(order.paymentStatus) === "SUCCESS" ? amount : 0;
      acc.totalOrders += 1;
      return acc;
    }, { totalAmount: 0, totalOrders: 0 });

    return res.json({
      summary: {
        totalOrders: totals.totalOrders,
        totalAmount: Number(totals.totalAmount.toFixed(2))
      },
      transactions: filtered.slice(0, 250).map(formatTransaction)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unable to load payment transactions." });
  }
});

module.exports = router;
