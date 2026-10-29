const health = require("./health");
const shipmentRoutes = require("./routes/shipment.routes");
const orderRoutes = require("./routes/order.routes");
const productRoutes = require("./routes/product.routes");
const { callCustomer } = require("./clients/customer.client");
const rateLimit = require("./middleware/rate-limit");
const redis = require("./clients/redis.client");
const { authenticate, authorize } = require("./middleware/auth");
const express = require("express");
const grpc = require("@grpc/grpc-js");
const { randomUUID } = require("node:crypto");
const { callAuth } = require("./clients/auth.client");

const app = express();
app.disable("x-powered-by");

// Ghi metadata request, khong ghi password hoac token.
app.use((req, res, next) => {
  const started = Date.now();
  const requestId = randomUUID();

  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    console.log(JSON.stringify({
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - started,
    }));
  });

  next();
});
const authRateLimit = rateLimit({
  prefix: "auth",
  limit: 10,
  windowSeconds: 60,
});

app.use(
  ["/api/auth/register", "/api/auth/login"],
  authRateLimit
);
app.use(express.json({ limit: "16kb" }));

function requireObjectBody(req, res, next) {
  if (
    !req.body ||
    typeof req.body !== "object" ||
    Array.isArray(req.body)
  ) {
    return res.status(400).json({
      message: "Request body must be a JSON object",
    });
  }
  next();
}

// Kiem tra tien trinh Gateway; chua kiem tra cac dependency.
app.get("/api/health", health);

app.post("/api/auth/register", requireObjectBody, async (req, res, next) => {
  try {
    const { username, password, email, phone } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof email !== "string" ||
      (phone !== undefined && typeof phone !== "string")
    ) {
      return res.status(400).json({
        message: "Invalid registration fields",
      });
    }

    const result = await callAuth("register", {
      username,
      password,
      email,
      phone: phone || "",
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", requireObjectBody, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: "Username and password must be strings",
      });
    }

    const result = await callAuth("login", { username, password });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      accessToken: result.access_token,
      tokenType: result.token_type,
      expiresIn: result.expires_in,
    });
  } catch (error) {
    next(error);
  }
});
app.get("/api/auth/me", authenticate, (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(req.user);
});

// Route tam de kiem tra phan quyen.
app.get(
  "/api/admin/check",
  authenticate,
  authorize("admin"),
  (req, res) => {
    res.json({ message: "Admin access granted" });
  }
);
app.get("/api/ready", health);
async function tryCache(operation) {
  if (!redis.isReady) return null;

  let timer;

  try {
    return await Promise.race([
      operation(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Cache timeout")),
          1000
        );
      }),
    ]);
  } catch (error) {
    console.error("Customer cache failed:", error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

app.get(
  "/api/customers/:uid",
  authenticate,
  customerAccess,
  async (req, res, next) => {
    try {
      const generation = await tryCache(() => redis.get("cache:customer-generation"));
      const key = `cache:customer:${generation || "0"}:${req.customerUid}`;

      res.setHeader("Cache-Control", "no-store");

      const cached = await tryCache(() => redis.get(key));

      if (cached) {
        try {
          const customer = JSON.parse(cached);
          res.setHeader("X-Cache", "HIT");
          return res.json(customer);
        } catch {
          await tryCache(() => redis.del(key));
        }
      }

      const customer = await callCustomer("getCustomer", {
        uid: req.customerUid,
      });

      await tryCache(() =>
        redis.set(key, JSON.stringify(customer), { EX: 30 })
      );

      res.setHeader("X-Cache", "MISS");
      res.json(customer);
    } catch (error) {
      next(error);
    }
  }
);
function customerAccess(req, res, next) {
  const rawUid = req.params.uid;
  const uid = Number(rawUid);

  if (
    !/^[1-9]\d*$/.test(rawUid) ||
    !Number.isInteger(uid) ||
    uid > 2147483647
  ) {
    return res.status(400).json({ message: "Invalid customer uid" });
  }

  if (req.user.role !== "admin" && req.user.uid !== rawUid) {
    return res.status(403).json({ message: "Forbidden customer access" });
  }

  req.customerUid = uid;
  next();
}

app.put(
  "/api/customers/:uid",
  authenticate,
  customerAccess,
  requireObjectBody,
  async (req, res, next) => {
    try {
      if (
        Object.keys(req.body).some(
          key => !["fullname", "mid"].includes(key)
        ) ||
        typeof req.body.fullname !== "string"
      ) {
        return res.status(400).json({
          message: "Only fullname and mid are accepted",
        });
      }

      const hasMid = Object.hasOwn(req.body, "mid");

      if (hasMid && req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only admin can change Membership",
        });
      }

      if (
        hasMid &&
        (!Number.isInteger(req.body.mid) ||
          req.body.mid <= 0 ||
          req.body.mid > 2147483647)
      ) {
        return res.status(400).json({
          message: "Invalid membership mid",
        });
      }

      const customer = await callCustomer("updateCustomer", {
        uid: req.customerUid,
        fullname: req.body.fullname,
        ...(hasMid ? { mid: req.body.mid } : {}),
      });

      await tryCache(() =>
        redis.incr("cache:customer-generation")
      );

      res.setHeader("Cache-Control", "no-store");

      res.json({
        message: "Customer updated successfully",
        uid: customer.uid,
      });
    } catch (error) {
      next(error);
    }
  }
);
      
app.use("/api/admin", require("./routes/membership.routes"));
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use((req, res) => {
  res.status(404).json({ message: "API not found" });
});

app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Invalid JSON" });
  }

  if (error.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }

  const mapping = {
    [grpc.status.INVALID_ARGUMENT]: 400,
    [grpc.status.ALREADY_EXISTS]: 409,
    [grpc.status.UNAUTHENTICATED]: 401,
    [grpc.status.PERMISSION_DENIED]: 403,
    [grpc.status.NOT_FOUND]: 404,
    [grpc.status.UNAVAILABLE]: 503,
    [grpc.status.DEADLINE_EXCEEDED]: 504,
  };

  const status = mapping[error.code] || 500;

  const message = status < 500
    ? error.details || "Request failed"
    : status === 503
      ? "Backend service unavailable"
      : status === 504
        ? "Backend service timed out"
        : "Internal server error";

  res.status(status).json({ message });
});

const port = Number(process.env.PORT || 3000);

async function start() {
  await redis.connect();
  await redis.ping();

  console.log("Gateway Redis connected");

  app.listen(port, "0.0.0.0", () => {
    console.log(`API Gateway listening on port ${port}`);
  });
}

start().catch((error) => {
  console.error("Gateway startup failed:", error.message);
  process.exit(1);
});
