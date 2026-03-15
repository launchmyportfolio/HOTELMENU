const API_BASE = import.meta.env.VITE_API_URL;

export default function OrderCard({order, refresh, token}){

  async function updateStatus(status){

    await fetch(`${API_BASE}/api/orders/${order._id}`,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        Authorization: `Bearer ${token}`
      },
      body:JSON.stringify({status})
    });

    refresh();
  }

async function deleteOrder(){

  if(!window.confirm("Delete this order?")) return;

  await fetch(`${API_BASE}/api/orders/${order._id}`,{
    method:"DELETE",
    headers:{
      Authorization: `Bearer ${token}`
    }
  });

  refresh();
}
  return(

    <div className="order-card">

      <h3>Table {order.tableNumber}</h3>
      <p className="muted">Name: {order.customerName || "Guest"}</p>
      <p className="muted">Phone: {order.phoneNumber || "N/A"}</p>

      {order.items.map((i,index)=>(
        <p key={index}>
          {i.name} x{i.qty}
        </p>
      ))}

      <h4>₹{order.total}</h4>

      <p className="status">{order.status}</p>

      <div className="buttons">

        <button onClick={()=>updateStatus("Cooking")}>
          Cooking
        </button>

        <button onClick={()=>updateStatus("Ready")}>
          Ready
        </button>

        <button onClick={()=>updateStatus("Served")}>
          Served
        </button>

        <button onClick={()=>updateStatus("Completed")}>
          Completed
        </button>

      </div>

      <button className="delete" onClick={deleteOrder}>
        Delete
      </button>

    </div>

  );
}
