import { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./Status.css";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { useNotifications } from "../context/NotificationContext";
import { API_BASE } from "../utils/apiBase";
import { mapTypeToStatus } from "../utils/notificationUtils";
import { buildCustomerRoute, buildPaymentSuccessRoute, readTableNumberFromSearch } from "../utils/customerRouting";
import { getBillItems, normalizeItemStatus } from "../utils/orderBillUtils";

function normalizeOrderStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PENDING" || key === "ACCEPTED") return "received";
  if (key === "COOKING" || key === "PREPARING") return "preparing";
  if (key === "READY") return "ready";
  if (key === "SERVED") return "served";
  if (key === "COMPLETED") return "completed";
  return "received";
}

function normalizePaymentStatus(value = "") {
  const key = String(value || "").trim().toUpperCase();
  if (key === "PAID") return "SUCCESS";
  if (["PENDING", "INITIATED", "SUCCESS", "FAILED"].includes(key)) return key;
  return "PENDING";
}

export default function Status() {
  const [status, setStatus] = useState("received");
  const [orderDetails, setOrderDetails] = useState(null);
  const [loadingOrder, setLoadingOrder] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const { session } = useCustomerSession();
  const { notifications } = useNotifications() || {};

  const orderId = useMemo(() => {
    const fromState = location.state?.orderId;
    if (fromState) return fromState;

    const fromQuery = new URLSearchParams(location.search).get("orderId");
    if (fromQuery) return fromQuery;

    if (session?.sessionId) {
      return localStorage.getItem(`latestOrder_${session.sessionId}`) || "";
    }
    return "";
  }, [location.state, location.search, session]);

  useEffect(() => {
    if (!orderId || !notifications?.length) return;
    const related = notifications.find(item => item.orderId === orderId);
    if (!related) return;
    const next = mapTypeToStatus(related.type);
    if (next) {
      setStatus(next);
    }
  }, [notifications, orderId]);

  useEffect(() => {
    let active = true;

    async function fetchStatus() {
      if (!orderId) {
        setLoadingOrder(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/orders/${orderId}`);
        if (!res.ok) {
          if (active) setLoadingOrder(false);
          return;
        }

        const order = await res.json();
        if (!active) return;

        setOrderDetails(order);
        setStatus(normalizeOrderStatus(order.status));
      } finally {
        if (active) setLoadingOrder(false);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [orderId, params.restaurantId]);

  const paymentStatus = normalizePaymentStatus(orderDetails?.paymentStatus || "PENDING");
  const orderStatusKey = String(orderDetails?.status || "").trim().toUpperCase();
  const isServed = orderStatusKey === "SERVED" || orderStatusKey === "COMPLETED";
  const isPaid = paymentStatus === "SUCCESS";
  const canAddMoreItems = Boolean(
    params.restaurantId
    && orderDetails
    && String(orderDetails.billStatus || "OPEN").trim().toUpperCase() === "OPEN"
    && paymentStatus !== "SUCCESS"
  );

  function goToPaymentPage() {
    if (!orderId || !params.restaurantId) return;

    const tableFromUrl = readTableNumberFromSearch(location.search, null);
    const tableNumber = Number(tableFromUrl || orderDetails?.tableNumber || session?.tableNumber || 0);
    navigate(buildCustomerRoute(params.restaurantId, `order/${orderId}/payment`, { tableNumber }));
  }

  function goToPaymentSuccessPage() {
    if (!params.restaurantId || !orderDetails?.receiptId || !orderDetails?.receiptShareToken) return;
    navigate(buildPaymentSuccessRoute(params.restaurantId, {
      orderId,
      receiptId: orderDetails.receiptId,
      token: orderDetails.receiptShareToken,
      tableNumber: orderDetails.tableNumber || session?.tableNumber || null
    }));
  }

  function goToItemsPage() {
    if (!params.restaurantId) return;
    const tableFromUrl = readTableNumberFromSearch(location.search, null);
    const tableNumber = Number(tableFromUrl || orderDetails?.tableNumber || session?.tableNumber || 0);
    navigate(buildCustomerRoute(params.restaurantId, "items", { tableNumber }));
  }

  return (
    <section className="status-section">
      <div className="status-overlay"></div>

      <div className="status-container">
        <h1 className="status-heading">Order Status</h1>

        <p className="status-subtext">
          Track the progress of your order
        </p>

        <div className="status-cards">
          <div className={`status-card ${status === "received" ? "status-active" : ""}`}>
            Order Received
          </div>

          <div className={`status-card ${status === "preparing" ? "status-active" : ""}`}>
            Preparing
          </div>

          <div className={`status-card ${status === "ready" ? "status-active" : ""}`}>
            Ready to Serve
          </div>

          <div className={`status-card ${(status === "served" || status === "completed") ? "status-active" : ""}`}>
            {status === "completed" ? "Completed" : "Served"}
          </div>
        </div>

        {loadingOrder && <p className="status-info-text">Loading order details...</p>}

        {orderDetails && (
          <div className="payment-status-panel">
            <h3>Running Bill</h3>
            <div className="order-items">
              {getBillItems(orderDetails).map((item, index) => (
                <div className="order-line" key={`${orderDetails._id || orderId}-status-${item.billItemId || index}`}>
                  <span>{item.name} x{item.qty}</span>
                  <span className={`status-pill ${String(normalizeItemStatus(item.status)).toLowerCase()}`}>
                    {normalizeItemStatus(item.status)}
                  </span>
                </div>
              ))}
            </div>

            <h3>Payment Details</h3>
            <div className="payment-status-grid">
              <div>
                <p>Method</p>
                <strong>{orderDetails.paymentMethod || "Not selected"}</strong>
              </div>
              <div>
                <p>Provider</p>
                <strong>{orderDetails.paymentProvider || "Not selected"}</strong>
              </div>
              <div>
                <p>Status</p>
                <strong className={`payment-status-text ${String(paymentStatus || "").toLowerCase()}`}>
                  {paymentStatus}
                </strong>
              </div>
              <div>
                <p>Amount</p>
                <strong>₹{Number(orderDetails.payableTotal || orderDetails.total || 0).toFixed(2)}</strong>
              </div>
            </div>

            {canAddMoreItems && (
              <div className="status-payment-cta-wrap">
                <p className="status-info-text">
                  Need anything else? You can keep adding items to this running bill until payment is completed.
                </p>
                <button
                  type="button"
                  className="status-payment-cta"
                  onClick={goToItemsPage}
                >
                  ADD MORE ITEMS
                </button>
              </div>
            )}

            {orderDetails.transactionId && (
              <p className="transaction-id">Transaction ID: {orderDetails.transactionId}</p>
            )}

            {(orderDetails.paymentInstructions || "").trim() && (
              <p className="payment-instruction-note">
                {orderDetails.paymentInstructions}
              </p>
            )}

            {!isServed && (
              <p className="status-info-text">
                Your order is being prepared. Payment will be enabled after serving.
              </p>
            )}

            {isServed && !isPaid && (
              <div className="status-payment-cta-wrap">
                <p className="status-info-text">
                  Your order has been served. Please make payment now.
                </p>
                <button
                  type="button"
                  className="status-payment-cta"
                  onClick={goToPaymentPage}
                >
                  MAKE PAYMENT
                </button>
              </div>
            )}

            {isPaid && (
              <div className="status-payment-cta-wrap">
                <p className="status-paid-label">Payment completed. Thank you.</p>
                {orderDetails?.receiptId && orderDetails?.receiptShareToken && (
                  <button
                    type="button"
                    className="status-payment-cta"
                    onClick={goToPaymentSuccessPage}
                  >
                    VIEW RECEIPT
                  </button>
                )}
              </div>
            )}

            {isServed && paymentStatus === "INITIATED" && (
              <p className="status-info-text">Payment is under verification. Please wait for approval.</p>
            )}

            {isServed && paymentStatus === "FAILED" && (
              <p className="status-failed-label">Payment failed. Please try again from Make Payment.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
