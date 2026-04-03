import { Link, useParams, useSearchParams } from "react-router-dom";
import "./PaymentReceipt.css";
import { buildCustomerRoute, parsePositiveTableNumber } from "../utils/customerRouting";

export default function PaymentFailed() {
  const { restaurantId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const tableNumber = parsePositiveTableNumber(searchParams.get("table"), null);
  const retryOrderId = String(searchParams.get("orderId") || "").trim();

  const retryUrl = retryOrderId
    ? buildCustomerRoute(restaurantId, `order/${retryOrderId}/payment`, { tableNumber })
    : buildCustomerRoute(restaurantId, "status", { tableNumber });

  const visitAgainUrl = tableNumber
    ? buildCustomerRoute(restaurantId, "login", { tableNumber })
    : "/";

  return (
    <section className="payment-receipt-page">
      <div className="payment-receipt-overlay" />
      <div className="payment-receipt-shell success-shell">
        <div className="payment-error-card">
          <div className="success-checkmark" style={{ background: "linear-gradient(160deg, #d85858, #9c1f1f)" }}>!</div>
          <h1>Payment Failed</h1>
          <p>Your payment was not completed. You can retry the payment or return later.</p>
          <div className="receipt-action-row">
            <Link className="receipt-btn secondary" to={retryUrl}>
              Retry Payment
            </Link>
            <Link className="receipt-btn ghost" to={visitAgainUrl}>
              Visit Again
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
