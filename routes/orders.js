const express = require("express");
const router = express.Router();
const db = require("../database");
const {
  authMiddleware,
  adminMiddleware,
  optionalAuth,
} = require("../middleware/auth");

// ── RATE LIMITER COMMANDES (uniquement sur POST) ──────────
const _ipRequests = new Map();
function orderRateLimiter(req, res, next) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const timestamps = (_ipRequests.get(ip) || []).filter(
    (t) => now - t < 3600000,
  );
  if (timestamps.length >= 5) {
    return res
      .status(429)
      .json({ error: "Trop de commandes. Réessayez dans une heure." });
  }
  timestamps.push(now);
  _ipRequests.set(ip, timestamps);
  next();
}

// Normalise un numéro algérien vers 0XXXXXXXXX
// Accepte: 0558210430 / +213558210430 / +2130558210430
function normalizeAlgerianPhone(phone) {
  const p = phone.replace(/\s/g, "");
  if (/^\+2130[5-7]\d{8}$/.test(p)) return "0" + p.slice(4);
  if (/^\+213[5-7]\d{8}$/.test(p)) return "0" + p.slice(3);
  if (/^0[5-7]\d{8}$/.test(p)) return p;
  return null;
}

async function generateRef() {
  const { rows } = await db.query("SELECT COUNT(*) as c FROM orders");
  return "#MT-" + String(parseInt(rows[0].c) + 1).padStart(4, "0");
}

function validateOrderInput({ customer, phone, wilaya, items }) {
  if (!customer || typeof customer !== "string" || customer.trim().length < 2)
    return "Nom invalide (minimum 2 caractères).";
  const phoneClean = normalizeAlgerianPhone(phone || "");
  if (!phoneClean)
    return "Numéro de téléphone invalide (ex: 0558210430, +213558210430 ou +2130558210430).";
  if (!wilaya || typeof wilaya !== "string" || wilaya.trim().length < 2)
    return "Wilaya invalide.";
  if (!Array.isArray(items) || items.length === 0 || items.length > 20)
    return "Panier invalide.";
  for (const item of items) {
    if (!Number.isInteger(Number(item.id)) || Number(item.id) < 1)
      return "Produit invalide.";
    if (
      !Number.isInteger(Number(item.qty)) ||
      Number(item.qty) < 1 ||
      Number(item.qty) > 99
    )
      return "Quantité invalide.";
  }
  return null;
}

// ── POST /api/orders ──────────────────────────────────────
router.post("/", orderRateLimiter, optionalAuth, async (req, res) => {
  try {
    const {
      customer,
      phone,
      wilaya,
      wilaya_id,
      address,
      notes,
      items,
      shipping,
    } = req.body;

    const validationError = validateOrderInput({
      customer,
      phone,
      wilaya,
      items,
    });
    if (validationError)
      return res.status(400).json({ error: validationError });

    let calculatedSubtotal = 0;
    const enrichedItems = [];

    for (const item of items) {
      const { rows } = await db.query(
        "SELECT * FROM products WHERE id = $1 AND active = 1",
        [parseInt(item.id)],
      );
      const product = rows[0];
      if (!product)
        return res
          .status(400)
          .json({ error: `Produit #${item.id} introuvable.` });

      const prices = JSON.parse(product.variant_prices);
      const variants = JSON.parse(product.variants);
      const variantStocks = JSON.parse(product.variant_stocks || "[]");
      const variantIndex = parseInt(item.variant) || 0;
      const price = prices[variantIndex] ?? prices[0];
      const qty = Math.min(99, Math.max(1, parseInt(item.qty) || 1));

      // Check stock for this specific variant
      const availableStock = variantStocks[variantIndex] ?? 0;
      // Allow order even if out of stock — admin will be notified

      calculatedSubtotal += price * qty;
      enrichedItems.push({
        id: product.id,
        name: product.name,
        variant: variants[variantIndex] || variants[0],
        variantIndex,
        price,
        qty,
        total: price * qty,
        outOfStock: availableStock < qty,
      });
    }

    const { rows: wRows } = await db.query(
      "SELECT * FROM wilayas WHERE id = $1",
      [wilaya_id],
    );
    const shippingPrice = wRows[0]
      ? wRows[0].shipping_price
      : parseInt(shipping) || 0;
    const total = calculatedSubtotal + shippingPrice;
    const orderRef = await generateRef();

    let userId = null;
    if (req.user) {
      const { rows: uRows } = await db.query(
        "SELECT id FROM users WHERE id = $1",
        [req.user.id],
      );
      if (uRows[0]) userId = uRows[0].id;
    }

    const { rows: inserted } = await db.query(
      `INSERT INTO orders (order_ref,user_id,customer,phone,wilaya,address,items,subtotal,shipping,total,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        orderRef,
        userId,
        customer.trim().substring(0, 100),
        normalizeAlgerianPhone(phone) || phone.replace(/\s/g, ""),
        wilaya.trim().substring(0, 100),
        address ? address.trim().substring(0, 300) : null,
        JSON.stringify(enrichedItems),
        calculatedSubtotal,
        shippingPrice,
        total,
        notes ? notes.trim().substring(0, 500) : null,
      ],
    );

    // Decrement stock per variant (allow negative to track over-ordered quantity)
    for (const item of enrichedItems) {
      const { rows: pRows } = await db.query(
        "SELECT variant_stocks FROM products WHERE id = $1",
        [item.id],
      );
      const stocks = JSON.parse(pRows[0]?.variant_stocks || "[]");
      console.log(
        `[STOCK DEBUG] Product ${item.id} - variant_stocks before: ${JSON.stringify(stocks)}, variantIndex: ${item.variantIndex}, qty: ${item.qty}`,
      );
      // No Math.max(0, ...) — we allow negative to show how much was ordered past 0
      stocks[item.variantIndex] = (stocks[item.variantIndex] || 0) - item.qty;
      const totalStock = stocks.reduce((a, b) => a + b, 0);

      // If total stock is now <= 0, mark product as out_of_stock
      const newStatus = totalStock <= 0 ? "out_of_stock" : "in_stock";
      await db.query(
        "UPDATE products SET variant_stocks = $1, stock = $2, status = $3 WHERE id = $4",
        [JSON.stringify(stocks), totalStock, newStatus, item.id],
      );
    }

    const order = inserted[0];
    res.status(201).json({
      ...order,
      items: JSON.parse(order.items),
      order_ref: orderRef,
      total_formatted: total.toLocaleString("fr-DZ") + " DA",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders/track/:ref ── public ─────────────────
router.get("/track/:ref", async (req, res) => {
  try {
    const raw = decodeURIComponent(req.params.ref).toUpperCase();
    const ref = raw.startsWith("#") ? raw : "#" + raw;
    const { rows } = await db.query(
      "SELECT id, order_ref, customer, wilaya, status, total, shipping, items, created_at FROM orders WHERE UPPER(order_ref) = $1",
      [ref],
    );
    if (!rows[0])
      return res.status(404).json({
        error: "Commande introuvable. Vérifiez le numéro (ex: #MT-0001).",
      });
    const o = rows[0];
    res.json({ ...o, items: JSON.parse(o.items) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders/my ────────────────────────────────────
router.get("/my", authMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json(rows.map((o) => ({ ...o, items: JSON.parse(o.items) })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/orders ── admin ──────────────────────────────
router.get("/", adminMiddleware, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const params = [];
    let where = "";
    if (status) {
      params.push(status);
      where = `WHERE status = $${params.length}`;
    }
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));
    const { rows } = await db.query(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as c FROM orders ${status ? "WHERE status = $1" : ""}`,
      status ? [status] : [],
    );
    const total = parseInt(countRows[0].c);
    res.json({
      orders: rows.map((o) => ({ ...o, items: JSON.parse(o.items) })),
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM orders WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows[0])
      return res.status(404).json({ error: "Commande non trouvée" });
    res.json({ ...rows[0], items: JSON.parse(rows[0].items) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/status", adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ["pending", "shipped", "delivered", "cancelled"];
    if (!allowed.includes(status))
      return res.status(400).json({ error: "Statut invalide" });
    const { rows } = await db.query("SELECT id FROM orders WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows[0])
      return res.status(404).json({ error: "Commande non trouvée" });
    await db.query("UPDATE orders SET status = $1 WHERE id = $2", [
      status,
      req.params.id,
    ]);
    res.json({ message: "Statut mis à jour", status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT id FROM orders WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows[0])
      return res.status(404).json({ error: "Commande non trouvée" });
    await db.query("DELETE FROM orders WHERE id = $1", [req.params.id]);
    res.json({ message: "Commande supprimée" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
