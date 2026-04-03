import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import "./PaymentReceipt.css";
import { buildCustomerRoute, buildReceiptRoute, parsePositiveTableNumber } from "../utils/customerRouting";

const API_BASE = import.meta.env.VITE_API_URL;

function formatCurrency(value) {
  return `₹${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getRestaurantMonogram(name = "") {
  const cleaned = String(name || "").trim();
  if (!cleaned) return "HM";
  return cleaned
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "HM";
}

export default function PaymentSuccess() {
  const { restaurantId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const receiptId = String(searchParams.get("receiptId") || "").trim();
  const token = String(searchParams.get("token") || "").trim();
  const tableNumber = parsePositiveTableNumber(searchParams.get("table"), null);

  useEffect(() => {
    let active = true;

    async function fetchReceipt() {
      if (!receiptId || !token) {
        setError("Receipt details are missing for this payment.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/receipts/${encodeURIComponent(receiptId)}?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Unable to load payment receipt.");
        }
        if (!active) return;
        setReceipt(data);
      } catch (fetchErr) {
        if (!active) return;
        setError(fetchErr.message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchReceipt();
    return () => {
      active = false;
    };
  }, [receiptId, token]);

  const receiptUrl = useMemo(() => {
    if (!receiptId || !token) return "";
    return buildReceiptRoute(restaurantId, receiptId, { token });
  }, [receiptId, restaurantId, token]);

  const visitAgainUrl = useMemo(() => {
    if (tableNumber) {
      return buildCustomerRoute(restaurantId, "login", { tableNumber });
    }
    return "/";
  }, [restaurantId, tableNumber]);

  async function handleCopyLink() {
    if (!receiptUrl || typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${receiptUrl}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Unable to copy receipt link. Please copy it from the address bar.");
    }
  }

  function handlePrintReceipt() {
    if (!receiptId || !token) return;
    navigate(buildReceiptRoute(restaurantId, receiptId, { token, print: true }));
  }

  return (
    <section className="payment-receipt-page">
      <div className="payment-receipt-overlay" />
      <div className="payment-receipt-shell success-shell">
        {loading && <p className="payment-receipt-info">Loading payment confirmation...</p>}

        {!loading && error && (
          <div className="payment-error-card">
            <h1>Unable to Load Payment Confirmation</h1>
            <p>{error}</p>
            <div className="receipt-action-row">
              <button type="button" className="receipt-btn secondary" onClick={() => window.location.reload()}>
                Retry
              </button>
              <Link className="receipt-btn" to={visitAgainUrl}>
                Visit Again
              </Link>
            </div>
          </div>
        )}

        {!loading && !error && receipt && (
          <>
            <div className="success-hero">
              <div className="success-checkmark" aria-hidden="true">✓</div>
              <div className="success-copy">
                <div className="brand-badge">
                  {receipt.restaurantSnapshot?.logoUrl
                    ? <img src={receipt.restaurantSnapshot.logoUrl} alt={receipt.restaurantSnapshot?.name || "Restaurant"} />
                    : <span>{getRestaurantMonogram(receipt.restaurantSnapshot?.name)}</span>}
                  <div>
                    <p className="brand-name">{receipt.restaurantSnapshot?.name || "Restaurant"}</p>
                    {receipt.restaurantSnapshot?.address && (
                      <p className="brand-address">{receipt.restaurantSnapshot.address}</p>
                    )}
                  </div>
                </div>

                <h1>Payment Successful</h1>
                <p className="success-subtitle">
                  Thank you for visiting! Have a great day. Visit us again.
                </p>
              </div>
            </div>

            <div className="success-summary-grid">
              <div className="summary-tile highlight">
                <span>Amount Paid</span>
                <strong>{formatCurrency(receipt.finalAmount)}</strong>
              </div>
              <div className="summary-tile">
                <span>Table</span>
                <strong>{receipt.tableNumber || tableNumber || "-"}</strong>
              </div>
              <div className="summary-tile">
                <span>Bill Number</span>
                <strong>{receipt.billNumber || receipt.orderId}</strong>
              </div>
              <div className="summary-tile">
                <span>Payment Method</span>
                <strong>{receipt.paymentMethod || receipt.paymentProvider || "Online"}</strong>
              </div>
              <div className="summary-tile">
                <span>Transaction ID</span>
                <strong>{receipt.razorpayPaymentId || receipt.transactionId || "-"}</strong>
              </div>
              <div className="summary-tile">
                <span>Paid At</span>
                <strong>{formatDateTime(receipt.paidAt || receipt.generatedAt)}</strong>
              </div>
            </div>

            <div className="receipt-preview-card">
              <div className="receipt-preview-head">
                <div>
                  <h2>Receipt Preview</h2>
                  <p>Receipt #{receipt.receiptNumber}</p>
                </div>
                <span className="paid-pill">PAID</span>
              </div>

              <div className="preview-list">
                {(receipt.items || []).slice(0, 5).map((item, index) => (
                  <div className="preview-row" key={`${receipt._id}-preview-${item.name}-${index}`}>
                    <span>{item.name} x{item.qty}</span>
                    <strong>{formatCurrency(item.lineTotal)}</strong>
                  </div>
                ))}
              </div>

              <div className="preview-total-row">
                <span>Total</span>
                <strong>{formatCurrency(receipt.finalAmount)}</strong>
              </div>
            </div>

            <div className="receipt-action-row">
              <Link className="receipt-btn" to={receiptUrl}>
                View Receipt
              </Link>
              <button type="button" className="receipt-btn secondary" onClick={handlePrintReceipt}>
                Download / Print PDF
              </button>
              <button type="button" className="receipt-btn ghost" onClick={handleCopyLink}>
                {copied ? "Receipt Link Copied" : "Copy Receipt Link"}
              </button>
              <Link className="receipt-btn ghost" to={visitAgainUrl}>
                Visit Again
              </Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
