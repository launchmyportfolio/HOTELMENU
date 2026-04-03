const crypto = require("crypto");

const BillReceipt = require("../models/BillReceipt");
const Restaurant = require("../models/Restaurant");
const {
  ensureBillItems,
  computeBillSubtotal,
  normalizePaymentStatus,
  PAYMENT_STATUS
} = require("./billService");

function createReceiptToken() {
  if (crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return crypto.randomBytes(18).toString("hex");
}

function createReceiptNumber(order = {}) {
  const now = new Date();
  const dateKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("");
  const orderTail = String(order._id || "").slice(-6).toUpperCase();
  return `RCT-${dateKey}-${orderTail || now.getTime().toString().slice(-6)}`;
}

function readGatewayOrderId(order = {}, latestTransaction = null) {
  return String(
    latestTransaction?.gatewayOrderId
    || order?.paymentGatewayResponse?.razorpayOrderId
    || order?.paymentGatewayResponse?.orderId
    || ""
  ).trim();
}

function readGatewayPaymentId(order = {}, latestTransaction = null) {
  return String(
    latestTransaction?.gatewayPaymentId
    || order?.paymentGatewayResponse?.razorpayPaymentId
    || order?.transactionId
    || ""
  ).trim();
}

function pickLatestSuccessfulTransaction(order = {}) {
  const transactions = Array.isArray(order.paymentTransactions) ? order.paymentTransactions : [];
  const successful = transactions.filter(item => String(item?.status || "").toUpperCase() === PAYMENT_STATUS.SUCCESS);
  const sorted = successful.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return sorted[0] || null;
}

function buildReceiptItems(order = {}) {
  const safeOrder = ensureBillItems(order);
  const billItems = Array.isArray(safeOrder.billItems) ? safeOrder.billItems : [];

  return billItems
    .filter(item => {
      const status = String(item?.status || "").trim().toUpperCase();
      return status !== "REJECTED" && status !== "CANCELLED";
    })
    .map(item => ({
      name: String(item?.name || "").trim(),
      category: String(item?.category || "General").trim() || "General",
      qty: Math.max(1, Number(item?.qty || 1)),
      unitPrice: Number(item?.price || 0),
      lineTotal: Number(item?.lineTotal || Number(item?.price || 0) * Math.max(1, Number(item?.qty || 1))),
      status: String(item?.status || "Served").trim() || "Served",
      orderedAt: item?.orderedAt || null
    }))
    .filter(item => item.name);
}

async function upsertReceiptForOrder(order) {
  const safeOrder = ensureBillItems(order);
  if (normalizePaymentStatus(safeOrder.paymentStatus) !== PAYMENT_STATUS.SUCCESS) {
    return null;
  }

  const restaurant = await Restaurant.findById(safeOrder.restaurantId).lean();
  const existingReceipt = await BillReceipt.findOne({ orderId: safeOrder._id });
  const latestTransaction = pickLatestSuccessfulTransaction(safeOrder);
  const subtotal = Number(computeBillSubtotal(safeOrder).toFixed(2));
  const convenienceFee = Number(Number(safeOrder.convenienceFee || 0).toFixed(2));
  const finalAmount = Number((Number(safeOrder.payableTotal || subtotal + convenienceFee)).toFixed(2));
  const receiptNumber = existingReceipt?.receiptNumber || String(safeOrder.receiptNumber || "").trim() || createReceiptNumber(safeOrder);
  const shareToken = existingReceipt?.shareToken || String(safeOrder.receiptShareToken || "").trim() || createReceiptToken();
  const items = buildReceiptItems(safeOrder);

  const payload = {
    orderId: safeOrder._id,
    restaurantId: String(safeOrder.restaurantId || ""),
    sessionId: String(safeOrder.sessionId || ""),
    tableNumber: Number(safeOrder.tableNumber || 0),
    billNumber: String(safeOrder.billNumber || `BILL-${String(safeOrder._id).slice(-6).toUpperCase()}`),
    receiptNumber,
    shareToken,
    currency: "INR",
    restaurantSnapshot: {
      name: String(restaurant?.name || "Restaurant"),
      address: String(restaurant?.address || ""),
      logoUrl: String(restaurant?.logoUrl || "")
    },
    customerSnapshot: {
      customerName: String(safeOrder.customerName || ""),
      phoneNumber: String(safeOrder.phoneNumber || "")
    },
    items,
    subtotal,
    taxAmount: 0,
    gstAmount: 0,
    convenienceFee,
    finalAmount,
    paymentStatus: "PAID",
    paymentMethod: String(safeOrder.paymentMethod || ""),
    paymentProvider: String(safeOrder.paymentProvider || ""),
    paymentAttemptId: String(safeOrder.paymentAttemptId || ""),
    transactionId: String(safeOrder.transactionId || readGatewayPaymentId(safeOrder, latestTransaction)),
    razorpayOrderId: readGatewayOrderId(safeOrder, latestTransaction),
    razorpayPaymentId: readGatewayPaymentId(safeOrder, latestTransaction),
    signature: String(latestTransaction?.signature || ""),
    paidAt: safeOrder.paidAt || new Date(),
    generatedAt: existingReceipt?.generatedAt || new Date()
  };

  const receipt = await BillReceipt.findOneAndUpdate(
    { orderId: safeOrder._id },
    payload,
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true
    }
  );

  safeOrder.receiptId = String(receipt._id);
  safeOrder.receiptNumber = receipt.receiptNumber;
  safeOrder.receiptShareToken = receipt.shareToken;
  safeOrder.receiptGeneratedAt = receipt.generatedAt || new Date();

  return receipt;
}

function buildReceiptAccessPayload(receipt) {
  if (!receipt) return null;
  return {
    receiptId: String(receipt._id || ""),
    receiptNumber: String(receipt.receiptNumber || ""),
    receiptShareToken: String(receipt.shareToken || "")
  };
}

function buildCustomerReceiptLinks(order, receipt) {
  const access = buildReceiptAccessPayload(receipt);
  if (!order || !access?.receiptId || !access?.receiptShareToken) {
    return null;
  }

  const restaurantId = encodeURIComponent(String(order.restaurantId || ""));
  const tableNumber = Number(order.tableNumber || 0);
  const orderId = String(order._id || "");
  const receiptId = access.receiptId;
  const token = access.receiptShareToken;
  const query = new URLSearchParams({
    orderId,
    receiptId,
    token
  });

  if (tableNumber > 0) {
    query.set("table", String(tableNumber));
  }

  return {
    ...access,
    paymentSuccessUrl: `/restaurant/${restaurantId}/payment-success?${query.toString()}`,
    receiptUrl: `/restaurant/${restaurantId}/receipt/${encodeURIComponent(receiptId)}?token=${encodeURIComponent(token)}`
  };
}

module.exports = {
  upsertReceiptForOrder,
  buildReceiptAccessPayload,
  buildCustomerReceiptLinks
};
