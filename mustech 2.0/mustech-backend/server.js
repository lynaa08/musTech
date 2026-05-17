require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── MIDDLEWARE ────────────────────────────────────────────
app.use(cors({
  origin: '*', // In production, set to your domain
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images statically
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// Serve frontend HTML if present
const frontendPath = path.join(__dirname, 'public');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// ── INIT DATABASE ─────────────────────────────────────────
require('./database'); // Runs table creation + seeding

// ── ROUTES ────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/wilayas',  require('./routes/wilayas'));
app.use('/api/ratings',  require('./routes/ratings'));
app.use('/api/stats',    require('./routes/stats'));

// ── HEALTH CHECK ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Mus Tech API is running 🚀', time: new Date().toISOString() });
});

// ── SERVE FRONTEND for all other routes ───────────────────
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: 'Mus Tech API — place your HTML file in /public/index.html' });
  }
});

// ── ERROR HANDLER ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Image trop grande (max 5MB)' });
  }
  res.status(500).json({ error: err.message || 'Erreur serveur' });
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Mus Tech Backend running on http://localhost:${PORT}`);
  console.log(`📦 API ready at http://localhost:${PORT}/api`);
  console.log(`🔑 Admin: ${process.env.ADMIN_EMAIL}`);
  console.log(`📁 Place your HTML in /public/index.html to serve it\n`);
});
