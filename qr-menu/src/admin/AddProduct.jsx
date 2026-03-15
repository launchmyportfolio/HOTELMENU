import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE = "http://localhost:5000";

export default function AddProduct({ token }) {

  const [form, setForm] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    image: "",
    available: true
  });

  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = { ...form, price: Number(form.price) };
      const res = await fetch(`${API_BASE}/api/menu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Unable to add product");

      navigate("/admin/menu");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="admin-dashboard">
      <h1>Add Product</h1>
      {error && <p className="error-text">{error}</p>}

      <form className="menu-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input name="name" value={form.name} onChange={handleChange} required />
        </label>

        <label>
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            rows="3"
          />
        </label>

        <label>
          Price (₹)
          <input
            name="price"
            type="number"
            value={form.price}
            onChange={handleChange}
            required
            min="0"
          />
        </label>

        <label>
          Category
          <input name="category" value={form.category} onChange={handleChange} />
        </label>

        <label>
          Image URL
          <input name="image" value={form.image} onChange={handleChange} />
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            name="available"
            checked={form.available}
            onChange={handleChange}
          />
          Available
        </label>

        <button type="submit">Save</button>
      </form>
    </div>
  );
}
