let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function emitNewOrder(order) {
  if (!ioInstance) return;
  ioInstance.emit("new-order", {
    restaurantId: order.restaurantId,
    orderId: order._id,
    status: order.status
  });
}

module.exports = { setIo, emitNewOrder };
