const express = require("express");
const router = express.Router();
const db = require("../database");
const { optionalAuth, adminMiddleware } = require("../middleware/auth");

router.post("/", optionalAuth, async (req, res) => {
  try {
    const { rating, comment, order_ref } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ error: "Note invalide (1-5)" });
    await db.query(
      "INSERT INTO ratings (user_id, order_ref, rating, comment) VALUES ($1,$2,$3,$4)",
      [
        req.user ? req.user.id : null,
        order_ref || null,
        parseInt(rating),
        comment || null,
      ],
    );
    res.status(201).json({ message: "Avis enregistré, merci !" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT AVG(rating) as average, COUNT(*) as total FROM ratings",
    );
    const stats = rows[0];
    res.json({
      average: stats.average ? Math.round(stats.average * 10) / 10 : null,
      total: parseInt(stats.total),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM ratings ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
