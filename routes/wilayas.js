const express = require("express");
const router = express.Router();
const db = require("../database");
const { adminMiddleware } = require("../middleware/auth");

router.get("/", async (req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM wilayas WHERE active = 1 ORDER BY id",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id", adminMiddleware, async (req, res) => {
  try {
    const { shipping_price, active } = req.body;
    const { rows } = await db.query("SELECT id FROM wilayas WHERE id = $1", [
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Wilaya non trouvée" });
    await db.query(
      "UPDATE wilayas SET shipping_price = $1, active = $2 WHERE id = $3",
      [
        parseInt(shipping_price),
        active !== undefined ? (active ? 1 : 0) : 1,
        req.params.id,
      ],
    );
    const { rows: updated } = await db.query(
      "SELECT * FROM wilayas WHERE id = $1",
      [req.params.id],
    );
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
