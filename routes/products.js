const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const db = require("../database");
const { adminMiddleware } = require("../middleware/auth");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "mustech-products",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Fichier image uniquement"));
  },
});

function parseProduct(row) {
  const variants = JSON.parse(row.variants || '["Standard"]');
  const variantPrices = JSON.parse(row.variant_prices || "[0]");
  const variantStocks = JSON.parse(row.variant_stocks || "[]");

  // Pad variant_stocks if missing entries
  while (variantStocks.length < variants.length) variantStocks.push(0);

  return {
    ...row,
    variants,
    variantPrices,
    variantStocks,
    oldPrice: row.old_price,
    costPrice: row.cost_price || 0,
    img: row.img || null,
    images: row.images ? JSON.parse(row.images) : row.img ? [row.img] : [],
    stock: variantStocks.reduce((a, b) => a + b, 0),
  };
}

// ── GET /api/products ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { cat, search } = req.query;
    let query = "SELECT * FROM products WHERE active = 1";
    const params = [];
    if (cat && cat !== "all") {
      params.push(`%${cat}%`);
      query += ` AND cat ILIKE $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND name ILIKE $${params.length}`;
    }
    query += " ORDER BY created_at DESC";
    const { rows } = await db.query(query, params);
    res.json(rows.map(parseProduct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/products/admin/all ── (admin, includes cost_price) ──
router.get("/admin/all", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC",
    );
    res.json(rows.map(parseProduct));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/products/:id ─────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM products WHERE id = $1 AND active = 1",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Produit non trouvé" });
    res.json(parseProduct(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/products ── (admin) ─────────────────────────
router.post(
  "/",
  adminMiddleware,
  upload.array("images", 15),
  async (req, res) => {
    try {
      const {
        name,
        cat,
        price,
        old_price,
        cost_price,
        icon,
        variants,
        variant_prices,
        variant_stocks,
        badge,
        description,
      } = req.body;
      if (!name || !cat || !price)
        return res
          .status(400)
          .json({ error: "Nom, catégorie et prix sont requis." });

      const variantsArr = variants ? JSON.parse(variants) : ["Standard"];
      const pricesArr = variant_prices
        ? JSON.parse(variant_prices)
        : [parseInt(price)];
      const stocksArr = variant_stocks
        ? JSON.parse(variant_stocks)
        : variantsArr.map(() => 0);
      const totalStock = stocksArr.reduce((a, b) => a + b, 0);
      const uploadedFiles = req.files ? req.files.map((f) => f.path) : [];
      const primaryImg = uploadedFiles[0] || null;

      const { rows } = await db.query(
        `INSERT INTO products (name,cat,price,old_price,cost_price,icon,img,images,variants,variant_prices,variant_stocks,stock,badge,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [
          name,
          cat,
          parseInt(price),
          old_price ? parseInt(old_price) : null,
          cost_price ? parseInt(cost_price) : 0,
          icon || "📦",
          primaryImg,
          JSON.stringify(uploadedFiles),
          JSON.stringify(variantsArr),
          JSON.stringify(pricesArr),
          JSON.stringify(stocksArr),
          totalStock,
          badge || null,
          description || null,
        ],
      );
      res.status(201).json(parseProduct(rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── PUT /api/products/:id ── (admin) ──────────────────────
router.put(
  "/:id",
  adminMiddleware,
  upload.array("images", 15),
  async (req, res) => {
    try {
      const { rows: existing } = await db.query(
        "SELECT * FROM products WHERE id = $1",
        [req.params.id],
      );
      if (!existing[0])
        return res.status(404).json({ error: "Produit non trouvé" });
      const ex = existing[0];

      const {
        name,
        cat,
        price,
        old_price,
        cost_price,
        icon,
        variants,
        variant_prices,
        variant_stocks,
        badge,
        description,
      } = req.body;
      const variantsArr = variants
        ? JSON.parse(variants)
        : JSON.parse(ex.variants);
      const pricesArr = variant_prices
        ? JSON.parse(variant_prices)
        : JSON.parse(ex.variant_prices);
      const stocksArr = variant_stocks
        ? JSON.parse(variant_stocks)
        : JSON.parse(ex.variant_stocks || "[]");
      const totalStock = stocksArr.reduce((a, b) => a + b, 0);

      const existingImgs = JSON.parse(ex.images || "[]");
      const toRemove = req.body.removeImages
        ? JSON.parse(req.body.removeImages)
        : [];
      const newFiles =
        req.files && req.files.length > 0 ? req.files.map((f) => f.path) : [];
      const kept = existingImgs.filter((img) => !toRemove.includes(img));
      const uploadedFiles = [...kept, ...newFiles].slice(0, 15);
      const primaryImg = uploadedFiles[0] || ex.img;

      const { rows } = await db.query(
        `UPDATE products SET name=$1,cat=$2,price=$3,old_price=$4,cost_price=$5,icon=$6,
       img=$7,images=$8,variants=$9,variant_prices=$10,variant_stocks=$11,stock=$12,badge=$13,description=$14
       WHERE id=$15 RETURNING *`,
        [
          name || ex.name,
          cat || ex.cat,
          price ? parseInt(price) : ex.price,
          old_price ? parseInt(old_price) : null,
          cost_price !== undefined ? parseInt(cost_price) : ex.cost_price || 0,
          icon || ex.icon,
          primaryImg,
          JSON.stringify(uploadedFiles),
          JSON.stringify(variantsArr),
          JSON.stringify(pricesArr),
          JSON.stringify(stocksArr),
          totalStock,
          badge !== undefined ? badge : ex.badge,
          description !== undefined ? description : ex.description,
          req.params.id,
        ],
      );
      res.json(parseProduct(rows[0]));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── DELETE /api/products/:id ── (admin) ───────────────────
router.delete("/:id", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id FROM products WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Produit non trouvé" });
    await db.query("UPDATE products SET active = 0 WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Produit supprimé" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════
// ── CATEGORIES ROUTES ─────────────────────────────────────
// ══════════════════════════════════════════════════════════

// GET /api/products/categories/all  — public
router.get("/categories/all", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM categories WHERE active = 1 ORDER BY name ASC",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/products/categories — admin
router.post("/categories", adminMiddleware, async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name || name.trim().length < 2)
      return res.status(400).json({ error: "Nom de catégorie invalide." });
    const { rows } = await db.query(
      "INSERT INTO categories (name, icon) VALUES ($1, $2) ON CONFLICT (name) DO UPDATE SET active=1 RETURNING *",
      [name.trim(), icon || "🏷️"],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/products/categories/:id — admin
router.delete("/categories/:id", adminMiddleware, async (req, res) => {
  try {
    await db.query("UPDATE categories SET active = 0 WHERE id = $1", [
      req.params.id,
    ]);
    res.json({ message: "Catégorie supprimée" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
