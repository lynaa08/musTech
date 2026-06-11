const { RateLimiterRedis, RateLimiterMemory } = require("rate-limiter-flexible");
const Redis = require("ioredis");

// ── CONNEXION REDIS ───────────────────────────────────────
// Si REDIS_URL est défini (Railway), on utilise Redis.
// Sinon, fallback sur la mémoire RAM (dev local).
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    lazyConnect: true,
  });

  redisClient.on("connect", () => console.log("✅ Redis connecté"));
  redisClient.on("error", (err) =>
    console.error("❌ Redis erreur:", err.message)
  );
}

// ── FACTORY : crée un limiter Redis ou Memory selon dispo ─
function createLimiter(opts) {
  if (redisClient) {
    return new RateLimiterRedis({ storeClient: redisClient, ...opts });
  }
  console.warn(`⚠️  Rate limiter "${opts.keyPrefix}" en mode RAM (pas de Redis)`);
  return new RateLimiterMemory(opts);
}

// ── LIMITER LOGIN (anti brute-force) ──────────────────────
// 10 tentatives / 15 min par IP
const loginLimiter = createLimiter({
  keyPrefix: "rl_login",
  points: 10,
  duration: 15 * 60,
  blockDuration: 15 * 60,
});

// ── LIMITER COMMANDES ─────────────────────────────────────
// 5 commandes / heure par IP
const orderLimiter = createLimiter({
  keyPrefix: "rl_order",
  points: 5,
  duration: 60 * 60,
  blockDuration: 60 * 60,
});

// ── MIDDLEWARE EXPRESS ────────────────────────────────────
function makeMiddleware(limiter, errorMsg) {
  return async (req, res, next) => {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";
    try {
      await limiter.consume(ip);
      next();
    } catch {
      res.status(429).json({ error: errorMsg });
    }
  };
}

module.exports = {
  loginRateLimiter: makeMiddleware(
    loginLimiter,
    "Trop de tentatives de connexion. Réessayez dans 15 minutes."
  ),
  orderRateLimiter: makeMiddleware(
    orderLimiter,
    "Trop de commandes. Réessayez dans une heure."
  ),
};
