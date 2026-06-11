// ============================================================
//  Mus Tech — API Helper
//  Add this <script src="api.js"></script> to your HTML
//  Set API_URL to your server address
// ============================================================

// Change to your server IP/
const API_URL = "https://mustech-production.up.railway.app/api";

// ── TOKEN STORAGE ─────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem("mt_token"),
  setToken: (t) => localStorage.setItem("mt_token", t),
  removeToken: () => localStorage.removeItem("mt_token"),
  getUser: () => {
    try {
      return JSON.parse(localStorage.getItem("mt_user"));
    } catch {
      return null;
    }
  },
  setUser: (u) => localStorage.setItem("mt_user", JSON.stringify(u)),
  removeUser: () => localStorage.removeItem("mt_user"),
  isLoggedIn: () => !!localStorage.getItem("mt_token"),
};

// ── BASE FETCH ────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_URL + endpoint, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

// ── AUTH API ──────────────────────────────────────────────
const AuthAPI = {
  async login(email, password) {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data.user;
  },

  async register(name, email, phone, password) {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, phone, password }),
    });
    Auth.setToken(data.token);
    Auth.setUser(data.user);
    return data.user;
  },

  logout() {
    Auth.removeToken();
    Auth.removeUser();
  },
};

// ── PRODUCTS API ──────────────────────────────────────────
const ProductsAPI = {
  getAll: (cat) =>
    apiFetch("/products" + (cat ? `?cat=${encodeURIComponent(cat)}` : "")),
  getOne: (id) => apiFetch("/products/" + id),

  async create(formData) {
    const token = Auth.getToken();
    const res = await fetch(API_URL + "/products", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData, // FormData for file upload
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur");
    return data;
  },

  async update(id, formData) {
    const token = Auth.getToken();
    const res = await fetch(API_URL + "/products/" + id, {
      method: "PUT",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur");
    return data;
  },

  delete: (id) => apiFetch("/products/" + id, { method: "DELETE" }),

  reorder: (order) =>
    apiFetch("/products/reorder", {
      method: "PATCH",
      body: JSON.stringify({ order }),
    }),
};

// ── ORDERS API ────────────────────────────────────────────
const OrdersAPI = {
  place: (orderData) =>
    apiFetch("/orders", { method: "POST", body: JSON.stringify(orderData) }),
  myOrders: () => apiFetch("/orders/my"),
  getAll: (status) => apiFetch("/orders" + (status ? `?status=${status}` : "")),
  updateStatus: (id, status) =>
    apiFetch("/orders/" + id + "/status", {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  delete: (id) => apiFetch("/orders/" + id, { method: "DELETE" }),
};

// ── WILAYAS API ───────────────────────────────────────────
const WilayasAPI = {
  getAll: () => apiFetch("/wilayas"),
  update: (id, data) =>
    apiFetch("/wilayas/" + id, { method: "PUT", body: JSON.stringify(data) }),
};

// ── RATINGS API ───────────────────────────────────────────
const RatingsAPI = {
  submit: (rating, comment, order_ref) =>
    apiFetch("/ratings", {
      method: "POST",
      body: JSON.stringify({ rating, comment, order_ref }),
    }),
  getStats: () => apiFetch("/ratings/stats"),
};

// ── STATS API ─────────────────────────────────────────────
const StatsAPI = {
  get: () => apiFetch("/stats"),
};
