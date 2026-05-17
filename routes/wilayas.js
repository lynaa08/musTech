const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { adminMiddleware } = require('../middleware/auth');

// GET /api/wilayas - all active wilayas
router.get('/', (req, res) => {
  const wilayas = db.prepare('SELECT * FROM wilayas WHERE active = 1 ORDER BY id').all();
  res.json(wilayas);
});

// PUT /api/wilayas/:id - update shipping price (admin)
router.put('/:id', adminMiddleware, (req, res) => {
  const { shipping_price, active } = req.body;
  const w = db.prepare('SELECT id FROM wilayas WHERE id = ?').get(req.params.id);
  if (!w) return res.status(404).json({ error: 'Wilaya non trouvée' });

  db.prepare('UPDATE wilayas SET shipping_price = ?, active = ? WHERE id = ?').run(
    parseInt(shipping_price),
    active !== undefined ? (active ? 1 : 0) : 1,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM wilayas WHERE id = ?').get(req.params.id));
});

module.exports = router;
