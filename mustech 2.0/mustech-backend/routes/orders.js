const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { authMiddleware, adminMiddleware, optionalAuth } = require('../middleware/auth');

// Generate order ref like #MT-0001
function generateRef() {
  const count = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
  return '#MT-' + String(count + 1).padStart(4, '0');
}

// ── POST /api/orders ── place an order ────────────────────
router.post('/', optionalAuth, (req, res) => {
  const { customer, phone, wilaya, wilaya_id, address, notes, items, subtotal, shipping } = req.body;

  if (!customer || !phone || !wilaya || !items || !items.length) {
    return res.status(400).json({ error: 'Informations de commande incomplètes.' });
  }

  // Validate items and calculate subtotal from DB prices
  let calculatedSubtotal = 0;
  const enrichedItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(item.id);
    if (!product) return res.status(400).json({ error: `Produit #${item.id} introuvable.` });

    const prices = JSON.parse(product.variant_prices);
    const variants = JSON.parse(product.variants);
    const price = prices[item.variant] ?? prices[0];
    const qty   = Math.max(1, parseInt(item.qty) || 1);
    calculatedSubtotal += price * qty;

    enrichedItems.push({
      id:      product.id,
      name:    product.name,
      variant: variants[item.variant] || variants[0],
      price,
      qty,
      total:   price * qty
    });
  }

  // Fetch shipping price from wilaya
  const wilayaRow = db.prepare('SELECT * FROM wilayas WHERE id = ?').get(wilaya_id);
  const shippingPrice = wilayaRow ? wilayaRow.shipping_price : (parseInt(shipping) || 0);
  const total = calculatedSubtotal + shippingPrice;

  const orderRef = generateRef();
  const result = db.prepare(`
    INSERT INTO orders (order_ref, user_id, customer, phone, wilaya, address, items, subtotal, shipping, total, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    orderRef,
    req.user ? req.user.id : null,
    customer, phone, wilaya,
    address || null,
    JSON.stringify(enrichedItems),
    calculatedSubtotal,
    shippingPrice,
    total,
    notes || null
  );

  // Update stock
  const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
  for (const item of enrichedItems) {
    updateStock.run(item.qty, item.id);
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({
    ...order,
    items: JSON.parse(order.items),
    order_ref: orderRef,
    total_formatted: total.toLocaleString('fr-DZ') + ' DA'
  });
});

// ── GET /api/orders/my ── user's own orders ───────────────
router.get('/my', authMiddleware, (req, res) => {
  const orders = db.prepare(`
    SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
  `).all(req.user.id);

  res.json(orders.map(o => ({ ...o, items: JSON.parse(o.items) })));
});

// ── GET /api/orders ── admin: all orders ──────────────────
router.get('/', adminMiddleware, (req, res) => {
  const { status, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const orders = db.prepare(query).all(...params);
  const total  = db.prepare('SELECT COUNT(*) as c FROM orders' + (status ? ' WHERE status = ?' : '')).get(...(status ? [status] : [])).c;

  res.json({
    orders: orders.map(o => ({ ...o, items: JSON.parse(o.items) })),
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit))
  });
});

// ── GET /api/orders/:id ── admin: single order ────────────
router.get('/:id', adminMiddleware, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
  res.json({ ...order, items: JSON.parse(order.items) });
});

// ── PUT /api/orders/:id/status ── admin: update status ────
router.put('/:id/status', adminMiddleware, (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'shipped', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide' });
  }
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande non trouvée' });

  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Statut mis à jour', status });
});

// ── DELETE /api/orders/:id ── admin ───────────────────────
router.delete('/:id', adminMiddleware, (req, res) => {
  const order = db.prepare('SELECT id FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande non trouvée' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Commande supprimée' });
});

module.exports = router;
