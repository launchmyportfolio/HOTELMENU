export default function OrderCard({order, refresh}){

  async function updateStatus(status){

    await fetch(`http://localhost:5000/api/orders/${order._id}`,{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({status})
    });

    refresh();
  }

async function deleteOrder(){

  if(!window.confirm("Delete this order?")) return;

  await fetch(`http://localhost:5000/api/orders/${order._id}`,{
    method:"DELETE"
  });

  refresh();
}
  return(

    <div className="order-card">

      <h3>Table {order.tableNumber}</h3>

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

      </div>

      <button className="delete" onClick={deleteOrder}>
        Delete
      </button>

    </div>

  );
}