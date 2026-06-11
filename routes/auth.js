const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");
const {
  loginRateLimiter,
  registerRateLimiter,
} = require("../middleware/rateLimiter");

// FIX: JWT payload minimal — id + role uniquement (pas de PII)
function signToken(user) {
  const expiry = user.role === "admin" ? "8h" : "1d";
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: expiry,
  });
}

// ── POST /api/auth/register ────────────────────────────────
// FIX: registerRateLimiter ajouté (anti-spam / énumération)
router.post("/register", registerRateLimiter, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password || password.length < 8)
      return res
        .status(400)
        .json({ error: "Champs invalides. Mot de passe min. 8 caractères." });

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0)
      return res.status(409).json({ error: "Cet e-mail est déjà utilisé." });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await db.query(
      "INSERT INTO users (name, email, phone, password, role) VALUES ($1,$2,$3,$4,'user') RETURNING *",
      [name, email.toLowerCase(), phone || null, hashed],
    );
    const user = result.rows[0];
    res.status(201).json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Erreur serveur interne"
          : err.message,
    });
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post("/login", loginRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "E-mail et mot de passe requis." });

    const result = await db.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase(),
    ]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password))
      return res
        .status(401)
        .json({ error: "E-mail ou mot de passe incorrect." });

    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({
      error:
        process.env.NODE_ENV === "production"
          ? "Erreur serveur interne"
          : err.message,
    });
  }
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get(
  "/me",
  require("../middleware/auth").authMiddleware,
  async (req, res) => {
    try {
      const result = await db.query(
        "SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1",
        [req.user.id],
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Utilisateur non trouvé" });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({
        error:
          process.env.NODE_ENV === "production"
            ? "Erreur serveur interne"
            : err.message,
      });
    }
  },
);

module.exports = router;
