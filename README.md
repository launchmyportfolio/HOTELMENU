# Hotel Menu – Multi‑Restaurant (SaaS) Quick Guide

This repo has two apps:
- `backend/` (Express + MongoDB)
- `qr-menu/` (React frontend)

## Base URLs
- Backend: `${VITE_API_URL}` (from frontend env) or `http://localhost:5000`
- Frontend (Vite dev): `http://localhost:5173`

### Default Tenant
If no restaurant is specified, the backend falls back to `DEFAULT_RESTAURANT_ID` (set in `.env`). Use this when migrating existing single-restaurant data.

---
## Restaurant Owner Auth
- **POST** `/api/restaurants/register`  
  Body: `{ name, ownerName, email, password, phone?, address? }`  
  Returns: `{ token, restaurant: { id, name, ownerName, email } }`

- **POST** `/api/restaurants/login`  
  Body: `{ email, password }`  
  Returns: `{ token, restaurant: { id, name, ownerName, email } }`

Use the returned JWT on all owner-protected endpoints:  
`Authorization: Bearer <token>`

---
## Customer (Public) Flow
### 1) Scan QR & Open Menu
- URL format: `/restaurant/:restaurantId?table=<tableNumber>`
- Fetch menu: **GET** `/api/menu?restaurantId=:restaurantId`

### 2) Start a Session
- **POST** `/api/customer/session/start`  
  Body: `{ restaurantId, tableNumber, customerName, phoneNumber }`

### 3) Check Session / Table Status
- **GET** `/api/customer/session/:tableNumber?restaurantId=:restaurantId`

### 4) End Session
- **POST** `/api/customer/session/end`  
  Body: `{ restaurantId, tableNumber, sessionId }`

### 5) Place Order
- **POST** `/api/orders`  
  Body: `{ restaurantId, tableNumber, customerName, phoneNumber, sessionId, items:[{name, price, qty}], total }`

---
## Owner Dashboard Endpoints
All require `Authorization: Bearer <token>` from owner login and are scoped by the token’s `restaurantId`.

### Menu
- **GET** `/api/menu?restaurantId=:restaurantId` (public fetch)
- **POST** `/api/menu` (create)
- **PUT** `/api/menu/:id` (update)
- **DELETE** `/api/menu/:id`

### Tables
- **GET** `/api/admin/tables` (list)
- **GET** `/api/admin/tables/summary`
- **POST** `/api/admin/tables/config` `{ totalTables }`
- **POST** `/api/admin/tables/:tableNumber/free`
- **POST** `/api/admin/tables/sync/session` `{ tableNumber, status, customerName?, phoneNumber? }`

### Orders
- **GET** `/api/orders` (owner list, newest first)
- **PATCH** `/api/orders/:id` `{ status }`
- **DELETE** `/api/orders/:id`
- **GET** `/api/orders/:id` (public status lookup)

---
## QR Codes
- QR value should be `https://<frontend-host>/restaurant/<restaurantId>?table=<tableNumber>`
- Owner dashboard uses `restaurantId` from the token when generating QR codes and downloads.

---
## Suggested Testing Flow
1. **Register Owner** → get token.
2. **Create Menu Items** with the token via `/api/menu`.
3. **Configure Tables** via `/api/admin/tables/config` (tokened).
4. **Generate QR**: use the URL pattern above.
5. **Customer** scans QR, starts session, places order.
6. **Owner** views/manages orders/tables in dashboard using the token.

---
## Environment Variables (examples)
```
MONGO_URI=mongodb://localhost:27017/hotelmenu
DEFAULT_RESTAURANT_ID=defaultRestaurant
OWNER_JWT_SECRET=super-secret
ADMIN_TOKEN=legacy-admin
ADMIN_USERNAME=Admin@123
ADMIN_PASSWORD=Admin@123
```

---
## Frontend Notes (pending wiring)
- Customer routes should read `restaurantId` from the URL and attach it to all API calls.
- Owner login/register pages should hit the endpoints above and store the JWT; protected API calls must include the bearer token.
- QR links and in-app navigation should preserve `restaurantId` (e.g., `/restaurant/:restaurantId/items`).
