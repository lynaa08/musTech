const express = require("express");
const router = express.Router();
const db = require("../database");
const {
  authMiddleware,
  adminMiddleware,
  optionalAuth,
} = require("../middleware/auth");

async function generateRef() {
  const { rows } = await db.query("SELECT COUNT(*) as c FROM orders");
  return "#MT-" + String(parseInt(rows[0].c) + 1).padStart(4, "0");
}

// ── POST /api/orders ──────────────────────────────────────
router.post("/", optionalAuth, async (req, res) => {
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
    if (!customer || !phone || !wilaya || !items || !items.length)
      return res
        .status(400)
        .json({ error: "Informations de commande incomplètes." });

    let calculatedSubtotal = 0;
    const enrichedItems = [];

    for (const item of items) {
      const { rows } = await db.query(
        "SELECT * FROM products WHERE id = $1 AND active = 1",
        [item.id],
      );
      const product = rows[0];
      if (!product)
        return res
          .status(400)
          .json({ error: `Produit #${item.id} introuvable.` });

      const prices = JSON.parse(product.variant_prices);
      const variants = JSON.parse(product.variants);
      const price = prices[item.variant] ?? prices[0];
      const qty = Math.max(1, parseInt(item.qty) || 1);
      calculatedSubtotal += price * qty;

      enrichedItems.push({
        id: product.id,
        name: product.name,
        variant: variants[item.variant] || variants[0],
        price,
        qty,
        total: price * qty,
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
        customer,
        phone,
        wilaya,
        address || null,
        JSON.stringify(enrichedItems),
        calculatedSubtotal,
        shippingPrice,
        total,
        notes || null,
      ],
    );

    // Update stock
    for (const item of enrichedItems) {
      await db.query(
        "UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2",
        [item.qty, item.id],
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
    const countParams = status ? [status] : [];
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as c FROM orders ${status ? "WHERE status = $1" : ""}`,
      countParams,
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

// ── GET /api/orders/:id ───────────────────────────────────
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

// ── PUT /api/orders/:id/status ────────────────────────────
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

// ── DELETE /api/orders/:id ────────────────────────────────
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
