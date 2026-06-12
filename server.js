require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

const app = express();

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://mustech.shop",
  "https://www.mustech.shop",
  ...(process.env.NODE_ENV !== "production"
    ? ["http://localhost:3001", "http://127.0.0.1:5500"]
    : []),
].filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-hashes'",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "blob:"],
        connectSrc: [
          "'self'",
          "https://mustech-production.up.railway.app",
          "https://api.emailjs.com",
          "https://cdnjs.cloudflare.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        upgradeInsecureRequests: [],
      },
    },
    permissionsPolicy: {
      features: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
      },
    },
  }),
);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin && process.env.NODE_ENV !== "production")
        return callback(null, true);
      if (!origin || allowedOrigins.includes(origin))
        return callback(null, true);
      callback(new Error("CORS bloqué: origine non autorisée"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use("/uploads", express.static(uploadsDir));

// ── INIT DATABASE ─────────────────────────────────────────
require("./database");

// ── ROUTES API ────────────────────────────────────────────
app.use("/api/auth", require("./routes/auth"));
app.use("/api/products", require("./routes/products"));
app.use("/api/orders", require("./routes/orders"));
app.use("/api/wilayas", require("./routes/wilayas"));
app.use("/api/ratings", require("./routes/ratings"));
app.use("/api/stats", require("./routes/stats"));
app.use("/api/promos", require("./routes/promos"));

// ── HEALTH CHECK ──────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Mus Tech API is running 🚀",
    time: new Date().toISOString(),
  });
});

// ── ADMIN ROUTE — protégé côté serveur ───────────────────
// Vérifie le cookie JWT avant de servir admin.html.
// Même si quelqu'un devine l'URL, sans cookie admin valide
// il est redirigé vers la page d'accueil.
app.get("/admin", (req, res) => {
  const token = req.cookies?.mt_auth;
  if (!token) return res.redirect("/?auth=required");
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    if (user.role !== "admin") return res.redirect("/");
    const adminPath = path.join(__dirname, "public", "admin.html");
    if (!fs.existsSync(adminPath)) {
      return res.status(404).json({ error: "admin.html introuvable" });
    }
    res.sendFile(adminPath);
  } catch {
    // Token expiré ou invalide
    res.redirect("/?auth=required");
  }
});

// ── SERVE FRONTEND (fichiers statiques publics) ───────────
// IMPORTANT : monter APRÈS la route /admin pour éviter que
// express.static serve admin.html directement via son URL de fichier.
const frontendPath = path.join(__dirname, "public");
if (fs.existsSync(frontendPath)) {
  // Bloquer l'accès direct à admin.html via fichier statique
  app.use((req, res, next) => {
    if (req.path.toLowerCase() === "/admin.html") {
      return res.redirect("/admin");
    }
    next();
  });
  app.use(express.static(frontendPath));
}

// ── SPA FALLBACK ──────────────────────────────────────────
app.get("*", (req, res) => {
  const indexPath = path.join(__dirname, "public", "index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ message: "Mus Tech API" });
  }
});

// ── ERROR HANDLER ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.message?.includes("CORS"))
    return res.status(403).json({ error: err.message });
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(400).json({ error: "Image trop grande (max 5MB)" });
  const message =
    process.env.NODE_ENV === "production"
      ? "Erreur serveur interne"
      : err.message || "Erreur serveur";
  res.status(500).json({ error: message });
});

// ── START ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 Mus Tech Backend running on http://localhost:${PORT}`);
  console.log(`📦 API ready at http://localhost:${PORT}/api`);
  console.log(`🔒 Admin panel at http://localhost:${PORT}/admin`);
  console.log(`🔑 Admin: ${process.env.ADMIN_EMAIL}`);
});
