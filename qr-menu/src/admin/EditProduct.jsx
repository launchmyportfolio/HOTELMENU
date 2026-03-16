import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/Admin.css";

const API_BASE = import.meta.env.VITE_API_URL;

export default function EditProduct({ token }) {

  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadItem() {
      try {
        const res = await fetch(`${API_BASE}/api/menu/${id}`);
        if (!res.ok) throw new Error("Item not found");
        const data = await res.json();
        setForm({
          name: data.name || "",
          description: data.description || "",
          price: data.price || "",
          category: data.category || "",
          image: data.image || "",
          available: data.available
        });
      } catch (err) {
        setError(err.message);
      }
    }
    loadItem();
  }, [id]);

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
      const res = await fetch(`${API_BASE}/api/menu/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Update failed");

      navigate("/owner/products");
    } catch (err) {
      setError(err.message);
    }
  }

  if (!form) {
    return (
      <div className="admin-dashboard">
        <h1>Edit Product</h1>
        {error ? <p className="error-text">{error}</p> : <p className="info-text">Loading...</p>}
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <h1>Edit Product</h1>
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

        <button type="submit">Save Changes</button>
      </form>
    </div>
  );
}
