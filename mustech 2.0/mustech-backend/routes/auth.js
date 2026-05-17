const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../database');

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ── POST /api/auth/register ────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Champs invalides. Mot de passe min. 6 caractères.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Cet e-mail est déjà utilisé.' });
  }

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (name, email, phone, password, role)
    VALUES (?, ?, ?, ?, 'user')
  `).run(name, email.toLowerCase(), phone || null, hashed);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// ── POST /api/auth/login ───────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-mail et mot de passe requis.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  }

  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role } });
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get('/me', require('../middleware/auth').authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
  res.json(user);
});

module.exports = router;
