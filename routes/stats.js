const express = require("express");
const router = express.Router();
const db = require("../database");
const { adminMiddleware } = require("../middleware/auth");

router.get("/", adminMiddleware, async (req, res) => {
  try {
    const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows[0]);

    const [
      orders,
      revenue,
      products,
      users,
      pending,
      delivered,
      rating,
      lowStock,
      recent,
      allOrders,
    ] = await Promise.all([
      q("SELECT COUNT(*) as c FROM orders"),
      q("SELECT SUM(subtotal) as s FROM orders WHERE status != 'cancelled'"),
      q("SELECT COUNT(*) as c FROM products WHERE active = 1"),
      q("SELECT COUNT(*) as c FROM users WHERE role = 'user'"),
      q("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'"),
      q("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'"),
      q("SELECT AVG(rating) as a FROM ratings"),
      q("SELECT COUNT(*) as c FROM products WHERE stock < 5 AND active = 1"),
      db.query(
        "SELECT id,order_ref,customer,wilaya,total,status,created_at FROM orders ORDER BY created_at DESC LIMIT 5",
      ),
      db.query("SELECT items FROM orders WHERE status = 'delivered'"),
    ]);

    // Calculer les produits les plus vendus depuis les vraies commandes
    const salesMap = {}; // { productId: { name, cat, price, qty, revenue } }
    for (const row of allOrders.rows) {
      let items = [];
      try {
        items = JSON.parse(row.items || "[]");
      } catch {}
      for (const item of items) {
        const id = item.id;
        if (!id) continue;
        if (!salesMap[id]) {
          salesMap[id] = {
            name: item.name || "—",
            variant: item.variant || "",
            price: item.price || 0,
            qty: 0,
            revenue: 0,
          };
        }
        salesMap[id].qty += item.qty || 0;
        salesMap[id].revenue += item.total || item.price * item.qty || 0;
      }
    }

    const topProducts = Object.entries(salesMap)
      .map(([id, data]) => ({ id: parseInt(id), ...data }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    res.json({
      totalOrders: parseInt(orders.c),
      totalRevenue: parseInt(revenue.s) || 0,
      totalProducts: parseInt(products.c),
      totalUsers: parseInt(users.c),
      pendingOrders: parseInt(pending.c),
      deliveredOrders: parseInt(delivered.c),
      avgRating: rating.a ? Math.round(rating.a * 10) / 10 : null,
      lowStock: parseInt(lowStock.c),
      recentOrders: recent.rows,
      topProducts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
