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
  return {
    ...row,
    variants: JSON.parse(row.variants || '["Standard"]'),
    variantPrices: JSON.parse(row.variant_prices || "[0]"),
    oldPrice: row.old_price,
    img: row.img || null,
    images: row.images ? JSON.parse(row.images) : row.img ? [row.img] : [],
  };
}

// ── GET /api/products ─────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const { cat, search } = req.query;
    let query = "SELECT * FROM products WHERE active = 1";
    const params = [];
    if (cat && cat !== "all") {
      params.push(cat);
      query += ` AND cat = $${params.length}`;
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
        icon,
        variants,
        variant_prices,
        stock,
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
      const uploadedFiles = req.files ? req.files.map((f) => f.path) : [];
      const primaryImg = uploadedFiles.length > 0 ? uploadedFiles[0] : null;

      const { rows } = await db.query(
        `INSERT INTO products (name,cat,price,old_price,icon,img,images,variants,variant_prices,stock,badge,description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [
          name,
          cat,
          parseInt(price),
          old_price ? parseInt(old_price) : null,
          icon || "📦",
          primaryImg,
          JSON.stringify(uploadedFiles),
          JSON.stringify(variantsArr),
          JSON.stringify(pricesArr),
          parseInt(stock) || 0,
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
        icon,
        variants,
        variant_prices,
        stock,
        badge,
        description,
      } = req.body;
      const variantsArr = variants
        ? JSON.parse(variants)
        : JSON.parse(ex.variants);
      const pricesArr = variant_prices
        ? JSON.parse(variant_prices)
        : JSON.parse(ex.variant_prices);
      const existingImgs = JSON.parse(ex.images || "[]");
      const toRemove = req.body.removeImages
        ? JSON.parse(req.body.removeImages)
        : [];
      const newFiles =
        req.files && req.files.length > 0 ? req.files.map((f) => f.path) : [];
      const kept = existingImgs.filter((img) => !toRemove.includes(img));
      const uploadedFiles = [...kept, ...newFiles].slice(0, 15);
      const primaryImg = uploadedFiles.length > 0 ? uploadedFiles[0] : ex.img;

      const { rows } = await db.query(
        `UPDATE products SET name=$1,cat=$2,price=$3,old_price=$4,icon=$5,
       img=$6,images=$7,variants=$8,variant_prices=$9,stock=$10,badge=$11,description=$12
       WHERE id=$13 RETURNING *`,
        [
          name || ex.name,
          cat || ex.cat,
          price ? parseInt(price) : ex.price,
          old_price ? parseInt(old_price) : null,
          icon || ex.icon,
          primaryImg,
          JSON.stringify(uploadedFiles),
          JSON.stringify(variantsArr),
          JSON.stringify(pricesArr),
          stock !== undefined ? parseInt(stock) : ex.stock,
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

module.exports = router;
