const jwt = require("jsonwebtoken");

// ── Lit le JWT depuis le cookie HttpOnly ──────────────────
function getTokenFromRequest(req) {
  return req.cookies?.mt_auth || null;
}

function authMiddleware(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: "Non authentifié" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Accès réservé à l'administrateur" });
    next();
  });
}

function optionalAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {}
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, optionalAuth };
