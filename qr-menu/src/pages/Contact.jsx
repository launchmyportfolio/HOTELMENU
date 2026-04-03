import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import "./Contact.css";
import { useCustomerSession } from "../context/CustomerSessionContext";
import { useNotifications } from "../context/NotificationContext";

const API_BASE = import.meta.env.VITE_API_URL;

export default function Contact() {

  const { restaurantId } = useParams();
  const { session } = useCustomerSession();
  const { pushLocalToast } = useNotifications() || {};
  const [form, setForm] = useState({
    name: "",
    email: "",
    message: ""
  });
  const [callingWaiter, setCallingWaiter] = useState(false);
  const [callMessage, setCallMessage] = useState("");
  const [restaurant, setRestaurant] = useState(null);

  useEffect(() => {
    if (!restaurantId) return undefined;
    let active = true;

    fetch(`${API_BASE}/api/restaurants/${encodeURIComponent(restaurantId)}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !active) return;
        setRestaurant(data);
      })
      .catch(() => {
        if (active) setRestaurant(null);
      });

    return () => {
      active = false;
    };
  }, [restaurantId]);

  function handleChange(e){
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  }

  function handleSubmit(e){
    e.preventDefault();
    alert("Message sent successfully!");
  }

  async function handleCallWaiter() {
    if (!session || !restaurantId) return;

    setCallingWaiter(true);
    setCallMessage("");
    try {
      const res = await fetch(`${API_BASE}/api/notifications/waiter-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          restaurantId,
          tableNumber: session.tableNumber,
          sessionId: session.sessionId,
          note: form.message?.trim() || "Customer requested waiter support."
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to notify staff");
      setCallMessage(data.message || "Staff has been notified.");
      pushLocalToast?.({
        title: "Waiter called",
        message: "Staff has been notified and should arrive shortly.",
        type: "WAITER_CALLED",
        priority: "HIGH"
      });
    } catch (err) {
      setCallMessage(err.message);
    } finally {
      setCallingWaiter(false);
    }
  }

  return (

   <section className="contact-section">

  <div className="contact-overlay"></div>

  <div className="contact-container">

    <h1 className="contact-heading">Contact Us</h1>

    <p className="contact-subtext">
      Have questions about your order or menu? Reach out to us.
    </p>

    <div className="contact-grid">

      <div className="contact-info">

        <h2>Restaurant Info</h2>

        <p>📍 {restaurant?.address || "Address not added yet"}</p>
        <p>📞 {restaurant?.phone || "Phone not added yet"}</p>
        <p>📧 Please contact the counter for support.</p>

        <p style={{marginTop:"20px"}}>
          Scan the QR at your table to order food directly from your phone.
        </p>

      </div>

      <form className="contact-form" onSubmit={handleSubmit}>

        <input
          className="contact-input"
          type="text"
          name="name"
          placeholder="Your Name"
          onChange={handleChange}
          required
        />

        <input
          className="contact-input"
          type="email"
          name="email"
          placeholder="Your Email"
          onChange={handleChange}
          required
        />

        <textarea
          className="contact-textarea"
          name="message"
          placeholder="Your Message"
          rows="5"
          onChange={handleChange}
          required
        />

        <button className="contact-button">
          Send Message
        </button>

        <button
          type="button"
          className="contact-button"
          onClick={handleCallWaiter}
          disabled={!session || callingWaiter}
          style={{ marginTop: "10px", background: "#0f9b4c" }}
        >
          {callingWaiter ? "Notifying..." : "Call Waiter"}
        </button>

        {callMessage && (
          <p className="muted" style={{ margin: "10px 0 0" }}>
            {callMessage}
          </p>
        )}

      </form>

    </div>

  </div>

</section>
  );
}
