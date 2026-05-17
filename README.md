# Mus Tech — Backend API

Full backend for the Mus Tech e-commerce store.
Built with Node.js + Express + SQLite.

---

## Quick Start

### 1. Install Node.js
Download from https://nodejs.org (version 18 or higher)

### 2. Install dependencies
```bash
cd mustech-backend
npm install
```

### 3. Start the server
```bash
npm start
```

Server runs at: http://localhost:3001

### 4. Place your HTML file
Copy your `MusTech-Store.html` to the `/public/` folder and rename it to `index.html`.
Then add this line inside your HTML `<head>`:
```html
<script src="/api.js"></script>
```

---

## Project Structure

```
mustech-backend/
├── server.js          ← Main entry point
├── database.js        ← SQLite setup + seeding
├── .env               ← Config (port, JWT secret, admin credentials)
├── mustech.db         ← SQLite database (auto-created)
├── uploads/           ← Product images (auto-created)
├── public/
│   ├── index.html     ← Your HTML file goes here
│   └── api.js         ← Frontend API helper
├── middleware/
│   └── auth.js        ← JWT authentication
└── routes/
    ├── auth.js        ← Login, register, /me
    ├── products.js    ← Product CRUD
    ├── orders.js      ← Order management
    ├── wilayas.js     ← Wilaya shipping prices
    ├── ratings.js     ← Customer ratings
    └── stats.js       ← Admin dashboard stats
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/register | Create account | None |
| POST | /api/auth/login | Login | None |
| GET | /api/auth/me | Get current user | Token |

### Products
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/products | All products | None |
| GET | /api/products/:id | Single product | None |
| POST | /api/products | Add product | Admin |
| PUT | /api/products/:id | Edit product | Admin |
| DELETE | /api/products/:id | Delete product | Admin |

### Orders
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/orders | Place order | Optional |
| GET | /api/orders/my | My orders | User |
| GET | /api/orders | All orders | Admin |
| PUT | /api/orders/:id/status | Update status | Admin |
| DELETE | /api/orders/:id | Delete order | Admin |

### Other
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | /api/wilayas | All wilayas + prices | None |
| PUT | /api/wilayas/:id | Update price | Admin |
| POST | /api/ratings | Submit rating | Optional |
| GET | /api/ratings/stats | Average rating | None |
| GET | /api/stats | Dashboard stats | Admin |
| GET | /api/health | Server health check | None |

---

## Configuration (.env)

```env
PORT=3001
JWT_SECRET=change_this_to_a_long_random_string
ADMIN_EMAIL=mustaphakerras@gmail.com
ADMIN_PASSWORD=mustapha123
```

---

## Run on Startup (Windows)

1. Install PM2: `npm install -g pm2`
2. Start with PM2: `pm2 start server.js --name mustech`
3. Save: `pm2 save`
4. Auto-start on boot: `pm2 startup`

## Run on Startup (Linux)

```bash
npm install -g pm2
pm2 start server.js --name mustech
pm2 save
pm2 startup
```

---

## Access from Another Device

Change `API_URL` in `public/api.js`:
```js
const API_URL = 'http://YOUR_PC_LOCAL_IP:3001/api';
// Example: const API_URL = 'http://192.168.1.5:3001/api';
```

Find your local IP:
- Windows: run `ipconfig` → look for IPv4 Address
- Linux: run `ip a` → look for inet address

---

## Admin Credentials
- Email: mustaphakerras@gmail.com
- Password: mustapha123
