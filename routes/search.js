const express = require("express");
const router = express.Router();
const db = require("../database");

// Helper function to parse product (same as in products.js)
function parseProduct(row) {
  const variants = JSON.parse(row.variants || '["Standard"]');
  const variantPrices = JSON.parse(row.variant_prices || "[0]");
  const variantStocks = JSON.parse(row.variant_stocks || "[]");
  const variantPurchasePrices = JSON.parse(row.variant_purchase_prices || "[]");

  while (variantStocks.length < variants.length) variantStocks.push(0);
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

// ── ADVANCED SEARCH ────────────────────────────────────────
// GET /api/search/advanced?q=search&minPrice=0&maxPrice=10000&categories=cat1,cat2&inStock=true&sort=price_low&limit=20&offset=0
router.get("/advanced", async (req, res) => {
  try {
    const {
      q = "",           // Search query
      minPrice = 0,
      maxPrice = 999999,
      categories = "",  // Comma-separated categories
      inStock = false,
      sort = "newest",
      limit = 20,
      offset = 0,
    } = req.query;

    let query = "SELECT * FROM products WHERE active = 1";
    const params = [];

    // ── TEXT SEARCH (name + description) ──────────────────
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      params.push(searchTerm);
      params.push(searchTerm);
      query += ` AND (name ILIKE $${params.length - 1} OR description ILIKE $${params.length})`;
    }

    // ── PRICE RANGE ───────────────────────────────────────
    const min = parseInt(minPrice) || 0;
    const max = parseInt(maxPrice) || 999999;
    params.push(min);
    params.push(max);
    query += ` AND price BETWEEN $${params.length - 1} AND $${params.length}`;

    // ── CATEGORIES ────────────────────────────────────────
    if (categories && categories.trim()) {
      const cats = categories
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);
      if (cats.length > 0) {
        const placeholders = cats
          .map((_, i) => `$${params.length + i + 1}`)
          .join(",");
        query += ` AND cat IN (${placeholders})`;
        params.push(...cats);
      }
    }

    // ── IN STOCK FILTER ───────────────────────────────────
    if (inStock === "true" || inStock === true) {
      query += " AND stock > 0";
    }

    // ── SORTING ───────────────────────────────────────────
    switch (sort) {
      case "price_low":
        query += " ORDER BY price ASC";
        break;
      case "price_high":
        query += " ORDER BY price DESC";
        break;
      case "rating":
        query += " ORDER BY rating DESC NULLS LAST";
        break;
      case "newest":
      default:
        query += " ORDER BY created_at DESC";
        break;
    }

    // ── PAGINATION ────────────────────────────────────────
    const pageLimit = Math.min(parseInt(limit) || 20, 100); // Max 100 per page
    const pageOffset = Math.max(parseInt(offset) || 0, 0);
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageLimit);
    params.push(pageOffset);

    // ── EXECUTE QUERY ─────────────────────────────────────
    const { rows } = await db.query(query, params);

    // ── GET TOTAL COUNT (without limit/offset) ────────────
    let countQuery = "SELECT COUNT(*) FROM products WHERE active = 1";
    const countParams = [];
    if (q && q.trim()) {
      const searchTerm = `%${q.trim()}%`;
      countParams.push(searchTerm);
      countParams.push(searchTerm);
      countQuery += ` AND (name ILIKE $${countParams.length - 1} OR description ILIKE $${countParams.length})`;
    }
    const min2 = parseInt(minPrice) || 0;
    const max2 = parseInt(maxPrice) || 999999;
    countParams.push(min2);
    countParams.push(max2);
    countQuery += ` AND price BETWEEN $${countParams.length - 1} AND $${countParams.length}`;
    if (categories && categories.trim()) {
      const cats = categories
        .split(",")
        .map((c) => c.trim())
        .filter((c) => c);
      if (cats.length > 0) {
        const placeholders = cats
          .map((_, i) => `$${countParams.length + i + 1}`)
          .join(",");
        countQuery += ` AND cat IN (${placeholders})`;
        countParams.push(...cats);
      }
    }
    if (inStock === "true" || inStock === true) {
      countQuery += " AND stock > 0";
    }

    const { rows: countResult } = await db.query(countQuery, countParams);
    const total = parseInt(countResult[0].count);

    res.json({
      products: rows.map(parseProduct),
      total,
      limit: pageLimit,
      offset: pageOffset,
      hasMore: pageOffset + pageLimit < total,
    });
  } catch (err) {
    console.error("Search error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET PRICE RANGE ────────────────────────────────────────
// GET /api/search/price-range
router.get("/price-range", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT MIN(price) as min_price, MAX(price) as max_price FROM products WHERE active = 1 AND stock > 0"
    );
    const { min_price, max_price } = rows[0];
    res.json({
      min: parseInt(min_price) || 0,
      max: parseInt(max_price) || 100000,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
