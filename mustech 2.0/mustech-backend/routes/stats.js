const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { adminMiddleware } = require('../middleware/auth');

// GET /api/stats - dashboard stats (admin only)
router.get('/', adminMiddleware, (req, res) => {
  const totalOrders    = db.prepare("SELECT COUNT(*) as c FROM orders").get().c;
  const totalRevenue   = db.prepare("SELECT SUM(total) as s FROM orders WHERE status != 'cancelled'").get().s || 0;
  const totalProducts  = db.prepare("SELECT COUNT(*) as c FROM products WHERE active = 1").get().c;
  const totalUsers     = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user'").get().c;
  const pendingOrders  = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c;
  const deliveredOrders= db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered'").get().c;
  const avgRating      = db.prepare("SELECT AVG(rating) as a FROM ratings").get().a;
  const lowStock       = db.prepare("SELECT COUNT(*) as c FROM products WHERE stock < 5 AND active = 1").get().c;

  const recentOrders = db.prepare(`
    SELECT id, order_ref, customer, wilaya, total, status, created_at
    FROM orders ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({
    totalOrders,
    totalRevenue,
    totalProducts,
    totalUsers,
    pendingOrders,
    deliveredOrders,
    avgRating: avgRating ? Math.round(avgRating * 10) / 10 : null,
    lowStock,
    recentOrders
  });
});

module.exports = router;
