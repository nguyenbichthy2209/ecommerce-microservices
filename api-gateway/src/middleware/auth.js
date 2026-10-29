const jwt = require("jsonwebtoken");

const secret = process.env.JWT_SECRET;

if (typeof secret !== "string" || secret.length < 32) {
  throw new Error("JWT_SECRET must contain at least 32 characters");
}

function authenticate(req, res, next) {
  const header = req.get("Authorization") || "";
  const match = /^Bearer ([^\s]+)$/i.exec(header);

  if (!match) {
    return res.status(401).json({
      message: "Missing or invalid Bearer token",
    });
  }

  try {
    const payload = jwt.verify(match[1], secret, {
      algorithms: ["HS256"],
      issuer: "ecommerce-auth",
      audience: "ecommerce-api",
    });

    if (
      typeof payload !== "object" ||
      typeof payload.sub !== "string" ||
      !/^[1-9]\d*$/.test(payload.sub) ||
      !["normal", "admin", "shipment_staff"].includes(payload.role) ||
      !Number.isInteger(payload.exp)
    ) {
      throw new Error("Invalid token claims");
    }

    req.user = {
      uid: payload.sub,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Insufficient permissions",
      });
    }

    next();
  };
}

module.exports = { authenticate, authorize };
