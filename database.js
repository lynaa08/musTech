const Database = require('better-sqlite3');
const path = require('path');
const dbPath = process.env.DATABASE_PATH || path.join('/tmp', 'mustech.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    active        INTEGER NOT NULL DEFAULT 1
  );
`);

// ── MIGRATIONS ─────────────────────────────────────────────
try {
  db.prepare('SELECT images FROM products LIMIT 1').get();
} catch (err) {
  console.log('🚧 Running migration: Adding "images" column to "products" table');
  db.exec('ALTER TABLE products ADD COLUMN images TEXT DEFAULT "[]"');
}

// ── SEED WILAYAS if empty ──────────────────────────────────
const wilayaCount = db.prepare('SELECT COUNT(*) as c FROM wilayas').get().c;
if (wilayaCount === 0) {
  const wilayas = [
    [1,'Adrar',1200],[2,'Chlef',900],[3,'Laghouat',1000],[4,'Oum El Bouaghi',900],
    [5,'Batna',900],[6,'Béjaïa',800],[7,'Biskra',1000],[8,'Béchar',1200],
    [9,'Blida',700],[10,'Bouira',750],[11,'Tamanrasset',1500],[12,'Tébessa',1000],
    [13,'Tlemcen',1000],[14,'Tiaret',950],[15,'Tizi Ouzou',800],[16,'Alger',600],
    [17,'Djelfa',950],[18,'Jijel',850],[19,'Sétif',850],[20,'Saïda',1000],
    [21,'Skikda',900],[22,'Sidi Bel Abbès',1000],[23,'Annaba',900],[24,'Guelma',950],
    [25,'Constantine',850],[26,'Médéa',750],[27,'Mostaganem',950],[28,'MSila',900],
    [29,'Mascara',1000],[30,'Ouargla',1100],[31,'Oran',900],[32,'El Bayadh',1100],
    [33,'Illizi',1500],[34,'Bordj Bou Arréridj',850],[35,'Boumerdès',700],
    [36,'El Tarf',950],[37,'Tindouf',1500],[38,'Tissemsilt',950],[39,'El Oued',1100],
    [40,'Khenchela',950],[41,'Souk Ahras',950],[42,'Tipaza',700],[43,'Mila',900],
    [44,'Aïn Defla',800],[45,'Naâma',1100],[46,'Aïn Témouchent',1000],
    [47,'Ghardaïa',1100],[48,'Relizane',1000],[49,'Timimoun',1300],[50,'Bordj Badji Mokhtar',1500],
    [51,'Ouled Djellal',1100],[52,'Béni Abbès',1200],[53,'In Salah',1400],
    [54,'In Guezzam',1500],[55,'Touggourt',1100],[56,'Djanet',1500],
    [57,'El MGhair',1100],[58,'El Menia',1200]
  ];
  const insert = db.prepare('INSERT INTO wilayas (id, name, shipping_price) VALUES (?, ?, ?)');
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  insertMany(wilayas);
  console.log('✅ Wilayas seeded');
}

// ── SEED ADMIN if no users ─────────────────────────────────
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
if (userCount === 0) {
  const bcrypt = require('bcryptjs');
  const adminPass = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'mustapha123', 10);
  db.prepare(`
    INSERT INTO users (name, email, phone, password, role)
    VALUES (?, ?, ?, ?, ?)
  `).run('Admin', process.env.ADMIN_EMAIL || 'mustaphakerras@gmail.com', '0558210430', adminPass, 'admin');
  console.log('✅ Admin user created');
}

module.exports = db;
