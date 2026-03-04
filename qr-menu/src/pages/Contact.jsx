import { useState } from "react";
import "./Contact.css";

export default function Contact() {

  const [form, setForm] = useState({
    name: "",
    email: "",
    message: ""
  });

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

        <p>📍 Bangalore, India</p>
        <p>📞 +91 98765 43210</p>
        <p>📧 support@restaurant.com</p>

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

      </form>

    </div>

  </div>

</section>
  );
}