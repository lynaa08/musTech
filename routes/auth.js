const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database");
const {
  loginRateLimiter,
  registerRateLimiter,
} = require("../middleware/rateLimiter");

// ── Cookie options ─────────────────────────────────────────
// HttpOnly  : JavaScript ne peut JAMAIS lire ce cookie
// Secure    : envoyé uniquement en HTTPS (forcé en production)
// SameSite  : "lax" suffit maintenant que le frontend est servi
//             par le MÊME serveur que l'API (origine identique —
//             voir API_URL = "/api" dans public/api.js).
//             "none" est réservé aux appels réellement cross-site et
//             est bloqué par défaut par Safari iOS (ITP / "Prevent
//             Cross-Site Tracking"), ce qui causait la déconnexion
//             ~2s après la connexion admin sur iPhone.
function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: maxAgeMs,
    path: "/",
  };
}

// JWT payload minimal — id + role uniquement (pas de PII)
function signToken(user) {
  const isAdmin = user.role === "admin";
  const expiresIn = isAdmin ? "8h" : "1d";
  const maxAge = isAdmin ? 8 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn },
  );
  return { token, maxAge };
}

const ERR = (err, res) =>
  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Erreur serveur interne"
        : err.message,
  });

// ── POST /api/auth/register ────────────────────────────────
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
    const { token, maxAge } = signToken(user);

    // Poser le cookie HttpOnly — le frontend ne voit jamais le token
    res.cookie("mt_auth", token, cookieOptions(maxAge));

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    ERR(err, res);
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

    const { token, maxAge } = signToken(user);

    // Poser le cookie HttpOnly
    res.cookie("mt_auth", token, cookieOptions(maxAge));

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
    });
  } catch (err) {
    ERR(err, res);
  }
});

// ── POST /api/auth/logout ──────────────────────────────────
router.post("/logout", (req, res) => {
  // Effacer le cookie côté serveur
  res.clearCookie("mt_auth", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  res.json({ message: "Déconnecté avec succès" });
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
      ERR(err, res);
    }
  },
);

module.exports = router;
