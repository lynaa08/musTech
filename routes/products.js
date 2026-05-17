const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../database');
const { adminMiddleware } = require('../middleware/auth');

// ── IMAGE UPLOAD SETUP ────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'product-' + unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Fichier image uniquement'));
  }
});

// Helper: parse product from DB row
function parseProduct(row) {
  return {
    ...row,
    variants:       JSON.parse(row.variants || '["Standard"]'),
    variantPrices:  JSON.parse(row.variant_prices || '[0]'),
    oldPrice:       row.old_price,
    img:            row.img ? `/uploads/${row.img}` : null,
    images:         row.images ? JSON.parse(row.images).map(i => `/uploads/${i}`) : (row.img ? [`/uploads/${row.img}`] : []),
  };
}

// ── GET /api/products ─────────────────────────────────────
router.get('/', (req, res) => {
  const { cat, search } = req.query;
  let query = 'SELECT * FROM products WHERE active = 1';
  const params = [];
  if (cat && cat !== 'all') {
    query += ' AND cat = ?';
    params.push(cat);
  }
  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(parseProduct));
});

// ── GET /api/products/:id ─────────────────────────────────
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produit non trouvé' });
  res.json(parseProduct(row));
});

// ── POST /api/products ── (admin) ─────────────────────────
router.post('/', adminMiddleware, upload.array('images', 5), (req, res) => {
  const { name, cat, price, old_price, icon, variants, variant_prices, stock, badge, description } = req.body;

  if (!name || !cat || !price) {
    return res.status(400).json({ error: 'Nom, catégorie et prix sont requis.' });
  }

  const variantsArr = variants ? JSON.parse(variants) : ['Standard'];
  const pricesArr   = variant_prices ? JSON.parse(variant_prices) : [parseInt(price)];

  const uploadedFiles = req.files ? req.files.map(f => f.filename) : [];
  const primaryImg = uploadedFiles.length > 0 ? uploadedFiles[0] : null;

  const result = db.prepare(`
    INSERT INTO products (name, cat, price, old_price, icon, img, images, variants, variant_prices, stock, badge, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, cat, parseInt(price),
    old_price ? parseInt(old_price) : null,
    icon || '📦',
    primaryImg,
    JSON.stringify(uploadedFiles),
    JSON.stringify(variantsArr),
    JSON.stringify(pricesArr),
    parseInt(stock) || 0,
    badge || null,
    description || null
  );

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseProduct(product));
});

// ── PUT /api/products/:id ── (admin) ──────────────────────
router.put('/:id', adminMiddleware, upload.array('images', 5), (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit non trouvé' });

  const { name, cat, price, old_price, icon, variants, variant_prices, stock, badge, description } = req.body;

  const variantsArr = variants ? JSON.parse(variants) : JSON.parse(existing.variants);
  const pricesArr   = variant_prices ? JSON.parse(variant_prices) : JSON.parse(existing.variant_prices);

  const useNewImages = req.files && req.files.length > 0;
  const uploadedFiles = useNewImages ? req.files.map(f => f.filename) : JSON.parse(existing.images || '[]');
  const primaryImg = uploadedFiles.length > 0 ? uploadedFiles[0] : existing.img;

  // Delete old images if new ones are uploaded
  if (useNewImages) {
    const oldImages = JSON.parse(existing.images || '[]');
    oldImages.forEach(oldFile => {
      const oldPath = path.join(uploadsDir, oldFile);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    });
    if (existing.img && !oldImages.includes(existing.img)) {
      const oldPath = path.join(uploadsDir, existing.img);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
  }

  db.prepare(`
    UPDATE products SET
      name = ?, cat = ?, price = ?, old_price = ?, icon = ?,
      img = ?, images = ?, variants = ?, variant_prices = ?,
      stock = ?, badge = ?, description = ?
    WHERE id = ?
  `).run(
    name || existing.name,
    cat  || existing.cat,
    price ? parseInt(price) : existing.price,
    old_price ? parseInt(old_price) : null,
    icon || existing.icon,
    primaryImg,
    JSON.stringify(uploadedFiles),
    JSON.stringify(variantsArr),
    JSON.stringify(pricesArr),
    stock !== undefined ? parseInt(stock) : existing.stock,
    badge !== undefined ? badge : existing.badge,
    description !== undefined ? description : existing.description,
    req.params.id
  );

  res.json(parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)));
});

// ── DELETE /api/products/:id ── (admin) ───────────────────
router.delete('/:id', adminMiddleware, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit non trouvé' });

  // Delete image files
  const oldImages = JSON.parse(existing.images || '[]');
  oldImages.forEach(oldFile => {
    const oldPath = path.join(uploadsDir, oldFile);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  });
  if (existing.img && !oldImages.includes(existing.img)) {
    const oldPath = path.join(uploadsDir, existing.img);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  // Soft delete
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Produit supprimé' });
});

module.exports = router;
