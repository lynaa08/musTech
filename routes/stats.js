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
    ]);

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
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
