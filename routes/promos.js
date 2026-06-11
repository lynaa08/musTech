const express = require("express");
const router = express.Router();
const db = require("../database");
const { adminMiddleware, authMiddleware } = require("../middleware/auth");

const ERR = (e, res) =>
  res.status(500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Erreur serveur interne"
        : e.message,
  });

// ── INIT TABLE ────────────────────────────────────────────
async function initPromos() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS promos (
      id            SERIAL PRIMARY KEY,
      type          TEXT    NOT NULL CHECK(type IN ('voucher','code')),
      name          TEXT    NOT NULL,
      code          TEXT    UNIQUE,
      value         INTEGER NOT NULL,
      value_type    TEXT    NOT NULL DEFAULT 'fixed' CHECK(value_type IN ('fixed','percent')),
      max_discount  INTEGER DEFAULT NULL,
      min_purchase  INTEGER NOT NULL DEFAULT 0,
      uses_max      INTEGER DEFAULT NULL,
      uses_count    INTEGER NOT NULL DEFAULT 0,
      expire_at     TIMESTAMP DEFAULT NULL,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
initPromos().catch(console.error);

// ── GET ALL (admin) ───────────────────────────────────────
router.get("/", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM promos ORDER BY created_at DESC",
    );
    res.json(rows);
  } catch (e) {
    ERR(e, res);
  }
});

// ── CREATE ────────────────────────────────────────────────
router.post("/", adminMiddleware, async (req, res) => {
  try {
    const {
      type,
      name,
      code,
      value,
      value_type = "fixed",
      max_discount,
      min_purchase = 0,
      uses_max,
      expire_at,
      active = 1,
    } = req.body;

    if (!type || !name || value == null)
      return res.status(400).json({ error: "type, name et value sont requis" });

    if (type === "code" && !code)
      return res.status(400).json({ error: "code requis pour type=code" });

    const { rows } = await db.query(
      `INSERT INTO promos
        (type,name,code,value,value_type,max_discount,min_purchase,uses_max,expire_at,active)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        type,
        name.trim(),
        type === "code" ? code.toUpperCase().trim() : null,
        parseInt(value),
        value_type,
        max_discount ? parseInt(max_discount) : null,
        parseInt(min_purchase) || 0,
        uses_max ? parseInt(uses_max) : null,
        expire_at || null,
        active ? 1 : 0,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === "23505")
      return res.status(400).json({ error: "Ce code existe déjà" });
    ERR(e, res);
  }
});

// ── UPDATE ────────────────────────────────────────────────
router.put("/:id", adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      value,
      value_type,
      max_discount,
      min_purchase,
      uses_max,
      expire_at,
      active,
    } = req.body;
    const { rows } = await db.query(
      `UPDATE promos SET
        name=$1, value=$2, value_type=$3, max_discount=$4,
        min_purchase=$5, uses_max=$6, expire_at=$7, active=$8
       WHERE id=$9 RETURNING *`,
      [
        name,
        parseInt(value),
        value_type,
        max_discount ? parseInt(max_discount) : null,
        parseInt(min_purchase) || 0,
        uses_max ? parseInt(uses_max) : null,
        expire_at || null,
        active ? 1 : 0,
        id,
      ],
    );
    if (!rows[0]) return res.status(404).json({ error: "Non trouvé" });
    res.json(rows[0]);
  } catch (e) {
    ERR(e, res);
  }
});

// ── TOGGLE ACTIVE ─────────────────────────────────────────
router.patch("/:id/toggle", adminMiddleware, async (req, res) => {
  try {
    const { rows } = await db.query(
      "UPDATE promos SET active = CASE WHEN active=1 THEN 0 ELSE 1 END WHERE id=$1 RETURNING *",
      [req.params.id],
    );
    res.json(rows[0]);
  } catch (e) {
    ERR(e, res);
  }
});

// ── DELETE ────────────────────────────────────────────────
router.delete("/:id", adminMiddleware, async (req, res) => {
  try {
    await db.query("DELETE FROM promos WHERE id=$1", [req.params.id]);
    res.json({ message: "Supprimé" });
  } catch (e) {
    ERR(e, res);
  }
});

// ── VALIDATE (public — used by product.html) ──────────────
router.post("/validate", async (req, res) => {
  try {
    const { code, subtotal = 0 } = req.body;
    if (!code) return res.status(400).json({ error: "Code manquant" });

    const { rows } = await db.query(
      "SELECT * FROM promos WHERE code=$1 AND type='code' AND active=1",
      [code.toUpperCase().trim()],
    );
    const promo = rows[0];
    if (!promo)
      return res.status(404).json({ error: "Code invalide ou inactif" });

    if (promo.expire_at && new Date(promo.expire_at) < new Date())
      return res.status(400).json({ error: "Code expiré" });

    if (promo.uses_max && promo.uses_count >= promo.uses_max)
      return res.status(400).json({ error: "Limite d'utilisation atteinte" });

    if (subtotal < promo.min_purchase)
      return res.status(400).json({
        error: `Achat minimum requis : ${promo.min_purchase.toLocaleString()} DA`,
      });

    let discount =
      promo.value_type === "percent"
        ? Math.round((subtotal * promo.value) / 100)
        : promo.value;
    if (promo.max_discount) discount = Math.min(discount, promo.max_discount);
    discount = Math.min(discount, subtotal);

    res.json({ valid: true, discount, promo });
  } catch (e) {
    ERR(e, res);
  }
});

// ── USE (called when order is placed with a code) ─────────
// FIX: authMiddleware ajouté — endpoint n'est plus public
router.post("/use", authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Code manquant" });
    await db.query(
      "UPDATE promos SET uses_count = uses_count + 1 WHERE code=$1",
      [code.toUpperCase().trim()],
    );
    res.json({ ok: true });
  } catch (e) {
    ERR(e, res);
  }
});

// ── STATS (dashboard) ─────────────────────────────────────
router.get("/stats", adminMiddleware, async (req, res) => {
  try {
    const q = (sql, p = []) => db.query(sql, p).then((r) => r.rows[0]);
    const [total, active, expired, pending] = await Promise.all([
      q("SELECT COUNT(*) c FROM promos"),
      q("SELECT COUNT(*) c FROM promos WHERE active=1"),
      q(
        "SELECT COUNT(*) c FROM promos WHERE expire_at IS NOT NULL AND expire_at < NOW()",
      ),
      q(
        "SELECT COUNT(*) c FROM promos WHERE active=1 AND (expire_at IS NULL OR expire_at > NOW())",
      ),
    ]);
    res.json({
      total: parseInt(total.c),
      active: parseInt(active.c),
      expired: parseInt(expired.c),
      pending: parseInt(pending.c),
    });
  } catch (e) {
    ERR(e, res);
  }
});

module.exports = router;
