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
    allowed_formats: ["jpg", "jpeg", "png", "webp", "avif"],
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
  const variantPurchasePrices = JSON.parse(row.variant_purchase_prices || "[]");

  // Pad variant_stocks if missing entries
  while (variantStocks.length < variants.length) variantStocks.push(0);
  // Pad variant_purchase_prices if missing entries
  while (variantPurchasePrices.length < variants.length)
    variantPurchasePrices.push(0);

  return {
    ...row,
    variants,
    variantPrices,
    variantStocks,
    variantPurchasePrices,
    oldPrice: row.old_price,
    costPrice: row.cost_price || 0,
    img: row.img || null,
    images: row.images ? JSON.parse(row.images) : row.img ? [row.img] : [],
    stock: variantStocks.reduce((a, b) => a + b, 0),
    status:
      variantStocks.reduce((a, b) => a + b, 0) <= 0
        ? "out_of_stock"
        : row.status || "in_stock",
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
    query += " ORDER BY sort_order ASC NULLS LAST, created_at DESC";
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
      "SELECT * FROM products WHERE active = 1 ORDER BY sort_order ASC NULLS LAST, created_at DESC",
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
  (req, res, next) => {
    upload.array("images", 15)(req, res, (err) => {
      if (err) {
        // Cloudinary or multer error: allow request without images
        console.error("[UPLOAD ERROR]", err.message);
        req.files = [];
        req.uploadError = err.message;
      }
      next();
    });
  },
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
        variant_purchase_prices,
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
      const purchasePricesArr = variant_purchase_prices
        ? JSON.parse(variant_purchase_prices)
        : variantsArr.map(() => (cost_price ? parseInt(cost_price) : 0));
      const totalStock = stocksArr.reduce((a, b) => a + b, 0);
      const uploadedFiles = req.files ? req.files.map((f) => f.path) : [];
      const primaryImg = uploadedFiles[0] || null;

      // New products go to top: assign sort_order lower than current minimum
      const { rows: minRow } = await db.query(
        "SELECT COALESCE(MIN(sort_order), 1) - 1 AS new_order FROM products WHERE active = 1",
      );
      const newSortOrder = minRow[0].new_order;

      // Ensure variant_purchase_prices column exists (migration safety)
      await db
        .query(
          `ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_purchase_prices TEXT DEFAULT '[]'`,
        )
        .catch(() => {});

      const { rows } = await db.query(
        `INSERT INTO products (name,cat,price,old_price,cost_price,icon,img,images,variants,variant_prices,variant_stocks,variant_purchase_prices,stock,badge,description,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
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
          JSON.stringify(purchasePricesArr),
          totalStock,
          badge || null,
          description || null,
          newSortOrder,
        ],
      );
      res.status(201).json({
        ...parseProduct(rows[0]),
        uploadWarning: req.uploadError || undefined,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── PUT /api/products/:id ── (admin) ──────────────────────
router.put(
  "/:id",
  adminMiddleware,
  (req, res, next) => {
    upload.array("images", 15)(req, res, (err) => {
      if (err) {
        console.error("[UPLOAD ERROR]", err.message);
        req.files = [];
        req.uploadError = err.message;
      }
      next();
    });
  },
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
        variant_purchase_prices,
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
      const purchasePricesArr = variant_purchase_prices
        ? JSON.parse(variant_purchase_prices)
        : JSON.parse(ex.variant_purchase_prices || "[]");
      const totalStock = stocksArr.reduce((a, b) => a + b, 0);

      const existingImgs = JSON.parse(ex.images || "[]");
      const toRemove = req.body.removeImages
        ? JSON.parse(req.body.removeImages)
        : [];
      const newFiles =
        req.files && req.files.length > 0 ? req.files.map((f) => f.path) : [];
      // Use keptImages (ordered by admin) if provided; otherwise filter from existing
      let kept;
      if (req.body.keptImages) {
        kept = JSON.parse(req.body.keptImages).filter(
          (img) => !toRemove.includes(img),
        );
      } else {
        kept = existingImgs.filter((img) => !toRemove.includes(img));
      }
      const uploadedFiles = [...kept, ...newFiles].slice(0, 15);
      const primaryImg = uploadedFiles[0] || ex.img;

      const { rows } = await db.query(
        `UPDATE products SET name=$1,cat=$2,price=$3,old_price=$4,cost_price=$5,icon=$6,
       img=$7,images=$8,variants=$9,variant_prices=$10,variant_stocks=$11,variant_purchase_prices=$12,stock=$13,badge=$14,description=$15,status=$16
       WHERE id=$17 RETURNING *`,
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
          JSON.stringify(purchasePricesArr),
          totalStock,
          badge !== undefined ? badge : ex.badge,
          description !== undefined ? description : ex.description,
          totalStock <= 0 ? "out_of_stock" : "in_stock",
          req.params.id,
        ],
      );
      res.json({
        ...parseProduct(rows[0]),
        uploadWarning: req.uploadError || undefined,
      });
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

// ── PATCH /api/products/reorder ── (admin) ────────────────
router.patch("/reorder", adminMiddleware, async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0)
      return res.status(400).json({ error: "order must be a non-empty array" });

    const ids = order.map((o) => parseInt(o.id));
    const sortOrders = order.map((o) => parseInt(o.sort_order));

    await db.query(
      `UPDATE products SET sort_order = data.sort_order
       FROM (SELECT UNNEST($1::int[]) AS id, UNNEST($2::int[]) AS sort_order) AS data
       WHERE products.id = data.id`,
      [ids, sortOrders],
    );
    res.json({ message: "Order saved" });
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
