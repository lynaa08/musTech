const Database = require("better-sqlite3");
const path = require("path");
const dbPath = process.env.DATABASE_PATH || path.join("/tmp", "mustech.db");
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── CREATE TABLES ─────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    phone       TEXT,
    password    TEXT    NOT NULL,
    role        TEXT    NOT NULL DEFAULT 'user',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    cat             TEXT    NOT NULL,
    price           INTEGER NOT NULL,
    old_price       INTEGER,
    icon            TEXT    DEFAULT '📦',
    img             TEXT,
    images          TEXT    DEFAULT '[]',
    rating          REAL    DEFAULT 5.0,
    reviews         INTEGER DEFAULT 0,
    variants        TEXT    NOT NULL DEFAULT '["Standard"]',
    variant_prices  TEXT    NOT NULL DEFAULT '[0]',
    stock           INTEGER NOT NULL DEFAULT 0,
    badge           TEXT,
    description     TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_ref   TEXT    NOT NULL UNIQUE,
    user_id     INTEGER,
    customer    TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    wilaya      TEXT    NOT NULL,
    address     TEXT,
    items       TEXT    NOT NULL,
    subtotal    INTEGER NOT NULL,
    shipping    INTEGER NOT NULL DEFAULT 0,
    total       INTEGER NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending',
    notes       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER,
    order_ref   TEXT,
    rating      INTEGER NOT NULL,
    comment     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wilayas (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    shipping_price INTEGER NOT NULL DEFAULT 800,
    bureau_price  INTEGER NOT NULL DEFAULT 600,
    active        INTEGER NOT NULL DEFAULT 1
  );
`);

// ── MIGRATIONS ─────────────────────────────────────────────
try {
  db.prepare("SELECT images FROM products LIMIT 1").get();
} catch (err) {
  console.log(
    '🚧 Running migration: Adding "images" column to "products" table',
  );
  db.exec('ALTER TABLE products ADD COLUMN images TEXT DEFAULT "[]"');
}

// ── ALL 69 WILAYAS (Algeria 2019 reform) ───────────────────
// Format: [id, name, shipping_price (domicile), bureau_price]
const ALL_WILAYAS = [
  [1, "Adrar", 1200, 900],
  [2, "Chlef", 900, 700],
  [3, "Laghouat", 1000, 750],
  [4, "Oum El Bouaghi", 900, 700],
  [5, "Batna", 900, 700],
  [6, "Béjaïa", 800, 600],
  [7, "Biskra", 1000, 750],
  [8, "Béchar", 1200, 900],
  [9, "Blida", 700, 500],
  [10, "Bouira", 750, 550],
  [11, "Tamanrasset", 1500, 1200],
  [12, "Tébessa", 1000, 750],
  [13, "Tlemcen", 1000, 750],
  [14, "Tiaret", 950, 700],
  [15, "Tizi Ouzou", 800, 600],
  [16, "Alger", 600, 400],
  [17, "Djelfa", 950, 700],
  [18, "Jijel", 850, 650],
  [19, "Sétif", 850, 650],
  [20, "Saïda", 1000, 750],
  [21, "Skikda", 900, 700],
  [22, "Sidi Bel Abbès", 1000, 750],
  [23, "Annaba", 900, 700],
  [24, "Guelma", 950, 700],
  [25, "Constantine", 850, 650],
  [26, "Médéa", 750, 550],
  [27, "Mostaganem", 950, 700],
  [28, "M'Sila", 900, 700],
  [29, "Mascara", 1000, 750],
  [30, "Ouargla", 1100, 850],
  [31, "Oran", 900, 700],
  [32, "El Bayadh", 1100, 850],
  [33, "Illizi", 1500, 1200],
  [34, "Bordj Bou Arréridj", 850, 650],
  [35, "Boumerdès", 700, 500],
  [36, "El Tarf", 950, 700],
  [37, "Tindouf", 1500, 1200],
  [38, "Tissemsilt", 950, 700],
  [39, "El Oued", 1100, 850],
  [40, "Khenchela", 950, 700],
  [41, "Souk Ahras", 950, 700],
  [42, "Tipaza", 700, 500],
  [43, "Mila", 900, 700],
  [44, "Aïn Defla", 800, 600],
  [45, "Naâma", 1100, 850],
  [46, "Aïn Témouchent", 1000, 750],
  [47, "Ghardaïa", 1100, 850],
  [48, "Relizane", 1000, 750],
  [49, "Timimoun", 1300, 1000],
  [50, "Bordj Badji Mokhtar", 1500, 1200],
  [51, "Ouled Djellal", 1100, 850],
  [52, "Béni Abbès", 1200, 900],
  [53, "In Salah", 1400, 1100],
  [54, "In Guezzam", 1500, 1200],
  [55, "Touggourt", 1100, 850],
  [56, "Djanet", 1500, 1200],
  [57, "El M'Ghair", 1100, 850],
  [58, "El Menia", 1200, 900],
  [59, "Ain Temouchent (Hassasna)", 1000, 750],
  [60, "El Eulma", 900, 700],
  [61, "Bir El Djir", 900, 700],
  [62, "Hammam Bou Hadjar", 1000, 750],
  [63, "Salah Bay", 900, 700],
  [64, "Ain Oussera", 950, 700],
  [65, "Robbah", 1100, 850],
  [66, "Mechraa Sfa", 950, 700],
  [67, "Sfizef", 1000, 750],
  [68, "Hadjout", 700, 500],
  [69, "El Amria", 1000, 750],
];

// ── SEED WILAYAS if empty ──────────────────────────────────
const wilayaCount = db.prepare("SELECT COUNT(*) as c FROM wilayas").get().c;
if (wilayaCount === 0) {
  const insert = db.prepare(
    "INSERT INTO wilayas (id, name, shipping_price, bureau_price) VALUES (?, ?, ?, ?)",
  );
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(ALL_WILAYAS);
  console.log("✅ All 69 wilayas seeded");
}

// ── MIGRATION: add missing wilayas 59-69 if not present ────
const insertOrIgnore = db.prepare(
  "INSERT OR IGNORE INTO wilayas (id, name, shipping_price, bureau_price) VALUES (?, ?, ?, ?)",
);
const addMissing = db.transaction((rows) => {
  let added = 0;
  for (const row of rows) {
    const exists = db
      .prepare("SELECT id FROM wilayas WHERE id = ?")
      .get(row[0]);
    if (!exists) {
      insertOrIgnore.run(row);
      added++;
    }
  }
  if (added > 0) console.log(`✅ Migration: added ${added} missing wilayas`);
});
addMissing(ALL_WILAYAS);

// ── MIGRATION: add bureau_price column if missing ──────────
try {
  db.prepare("SELECT bureau_price FROM wilayas LIMIT 1").get();
} catch (err) {
  console.log('🚧 Migration: Adding "bureau_price" column to "wilayas" table');
  db.exec(
    "ALTER TABLE wilayas ADD COLUMN bureau_price INTEGER NOT NULL DEFAULT 600",
  );
  // Backfill bureau_price as roughly 75% of shipping_price for existing rows
  db.exec(
    "UPDATE wilayas SET bureau_price = CAST(shipping_price * 0.75 AS INTEGER) WHERE bureau_price = 600",
  );
  console.log("✅ bureau_price column added and backfilled");
}

// ── SEED ADMIN if no users ─────────────────────────────────
const userCount = db.prepare("SELECT COUNT(*) as c FROM users").get().c;
if (userCount === 0) {
  const bcrypt = require("bcryptjs");
  const adminPass = bcrypt.hashSync(
    process.env.ADMIN_PASSWORD || "mustapha123",
    10,
  );
  db.prepare(
    `
    INSERT INTO users (name, email, phone, password, role)
    VALUES (?, ?, ?, ?, ?)
  `,
  ).run(
    "Admin",
    process.env.ADMIN_EMAIL || "mustaphakerras@gmail.com",
    "0558210430",
    adminPass,
    "admin",
  );
  console.log("✅ Admin user created");
}

module.exports = db;
