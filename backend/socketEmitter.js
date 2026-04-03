let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function getIo() {
  return ioInstance;
}

function getRestaurantRoom(restaurantId) {
  return `restaurant_${restaurantId}`;
}

function getRoleRoom(role, restaurantId) {
  return `role_${String(role || "").toUpperCase()}_${restaurantId}`;
}

function getTableRoom(tableNumber) {
  return `table_${Number(tableNumber)}`;
}

function getRestaurantTableRoom(restaurantId, tableNumber) {
  return `table_${restaurantId}_${Number(tableNumber)}`;
}

function emitNewOrder(order) {
  if (!ioInstance) return;

  const payload = {
    restaurantId: order.restaurantId,
    orderId: order._id,
    status: order.status,
    tableNumber: order.tableNumber,
    updatedAt: order.updatedAt || new Date().toISOString()
  };

  // Backward compatible global event for existing clients
  ioInstance.emit("new-order", payload);
  ioInstance.to(getRestaurantRoom(order.restaurantId)).emit("new-order", payload);
}

function emitOrderUpdated(order) {
  if (!ioInstance) return;

  const payload = {
    restaurantId: order.restaurantId,
    orderId: order._id,
    status: order.status,
    tableNumber: order.tableNumber,
    updatedAt: order.updatedAt || new Date().toISOString()
  };

  ioInstance.emit("order-updated", payload);
  ioInstance.to(getRestaurantRoom(order.restaurantId)).emit("order-updated", payload);
}

function emitNotification(notification) {
  if (!ioInstance || !notification) return;

  const payload = notification.toObject ? notification.toObject() : notification;
  const restaurantId = payload.restaurantId;
  const role = payload.targetRole;
  const rooms = new Set();

  if (restaurantId) {
    rooms.add(getRestaurantRoom(restaurantId));
  }

  if (restaurantId && role) {
    rooms.add(getRoleRoom(role, restaurantId));
  }

  if (payload.tableNumber !== undefined && payload.tableNumber !== null) {
    rooms.add(getTableRoom(payload.tableNumber));
    if (restaurantId) {
      rooms.add(getRestaurantTableRoom(restaurantId, payload.tableNumber));
    }
  }

  if (!rooms.size) {
    ioInstance.emit("notification:new", payload);
    return;
  }

  let emitter = ioInstance;
  rooms.forEach(room => {
    emitter = emitter.to(room);
  });
  emitter.emit("notification:new", payload);
}

module.exports = {
  setIo,
  getIo,
  emitNewOrder,
  emitOrderUpdated,
  emitNotification,
  getRestaurantRoom,
  getRoleRoom,
  getTableRoom,
  getRestaurantTableRoom
};
