const express = require("express");
const router = express.Router();
const db = require("../database");
const { optionalAuth, adminMiddleware } = require("../middleware/auth");
const { ratingsRateLimiter } = require("../middleware/rateLimiter");

const ERR = (err, res) =>
  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Erreur serveur interne"
        : err.message,
  });

// ── POST /api/ratings ─────────────────────────────────────
// FIX: rate limit ajouté + validation comment + vérif order_ref
router.post("/", ratingsRateLimiter, optionalAuth, async (req, res) => {
  try {
    const { rating, comment, order_ref } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ error: "Note invalide (1-5)" });

    // FIX: limite taille commentaire
    if (comment && typeof comment === "string" && comment.length > 1000)
      return res
        .status(400)
        .json({ error: "Commentaire trop long (max 1000 caractères)" });

    // FIX: vérifier que order_ref existe si fourni
    if (order_ref) {
      const { rows: orderRows } = await db.query(
        "SELECT id FROM orders WHERE order_ref = $1",
        [order_ref],
      );
      if (!orderRows[0])
        return res
          .status(400)
          .json({ error: "Référence de commande invalide" });
    }

    await db.query(
      "INSERT INTO ratings (user_id, order_ref, rating, comment) VALUES ($1,$2,$3,$4)",
      [
        req.user ? req.user.id : null,
        order_ref || null,
        parseInt(rating),
        comment ? comment.trim().substring(0, 1000) : null,
      ],
    );
    res.status(201).json({ message: "Avis enregistré, merci !" });
  } catch (err) {
    ERR(err, res);
  }
});

// ── GET /api/ratings/stats ─────────────────────────────────
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
    ERR(err, res);
  }
});

// ── GET /api/ratings — admin ───────────────────────────────
router.get("/", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM ratings ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (err) {
    ERR(err, res);
  }
});

module.exports = router;
