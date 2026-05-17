const express = require('express');
const router  = express.Router();
const db      = require('../database');
const { optionalAuth, adminMiddleware } = require('../middleware/auth');

// POST /api/ratings - submit a rating
router.post('/', optionalAuth, (req, res) => {
  const { rating, comment, order_ref } = req.body;
  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Note invalide (1-5)' });
  }
  db.prepare('INSERT INTO ratings (user_id, order_ref, rating, comment) VALUES (?, ?, ?, ?)').run(
    req.user ? req.user.id : null,
    order_ref || null,
    parseInt(rating),
    comment || null
  );
  res.status(201).json({ message: 'Avis enregistré, merci !' });
});

// GET /api/ratings/stats - average rating (public)
router.get('/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT AVG(rating) as average, COUNT(*) as total FROM ratings
  `).get();
  res.json({ average: stats.average ? Math.round(stats.average * 10) / 10 : null, total: stats.total });
});

// GET /api/ratings - all ratings (admin)
router.get('/', adminMiddleware, (req, res) => {
  const ratings = db.prepare('SELECT * FROM ratings ORDER BY created_at DESC').all();
  res.json(ratings);
});

module.exports = router;
