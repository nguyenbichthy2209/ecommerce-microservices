const { randomUUID } = require("node:crypto");
const waitOrder = require("../application/wait-order");
const express = require("express");
const { authenticate } = require("../middleware/auth");
const { callOrder } = require("../clients/order.client");

const router = express.Router();
function toRestOrder(order) {
  return {
    ...order,
    discount_rate: Number(order.discount_rate),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    total_amount: Number(order.total_amount),
    items: order.items.map(item => ({
      ...item,
      unit_price: Number(item.unit_price),
    })),
  };
}
router.use(authenticate);

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

router.post("/", async (req, res, next) => {
  try {
    const requestKey = req.get("Idempotency-Key") || randomUUID();
    res.setHeader("Idempotency-Key", requestKey);
    const body = req.body;

    if (
      !requestKey ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(requestKey)
    ) {
      return res.status(400).json({
        message: "Invalid Idempotency-Key header",
      });
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(key => key !== "items") ||
      !Array.isArray(body.items) ||
      body.items.length < 1 ||
      body.items.length > 100
    ) {
      return res.status(400).json({ message: "Invalid order items" });
    }

    const items = [];

    for (const item of body.items) {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        Object.keys(item).some(key => !["pid", "qty"].includes(key)) ||
        !Number.isInteger(item.pid) ||
        item.pid <= 0 ||
        item.pid > 2147483647 ||
        !Number.isInteger(item.qty) ||
        item.qty <= 0 ||
        item.qty > 2147483647
      ) {
        return res.status(400).json({ message: "Invalid product or quantity" });
      }

      items.push({ pid: item.pid, qty: item.qty });
    }

    const result = await callOrder("createOrder", {
      uid: Number(req.user.uid),
      request_key: requestKey,
      items,
    });

        const order = await waitOrder({
      initial: result,
      uid: Number(req.user.uid),
      requestKey,
    });

    res.setHeader("Location", `/api/orders/${order.oid}`);
    res.status(201).json(order);
  } catch (error) {
    next(error);
  }
});

router.get("/requests/:requestKey", async (req, res, next) => {
  try {
        const result = await callOrder("getOrderRequest", {
      requester_uid: Number(req.user.uid),
      request_key: req.params.requestKey,
    });

    res.json({
      ...result,
      order: result.order ? toRestOrder(result.order) : null,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const rawLimit = req.query.limit === undefined ? "20" : req.query.limit;
    const rawOffset = req.query.offset === undefined ? "0" : req.query.offset;

    if (
      typeof rawLimit !== "string" ||
      typeof rawOffset !== "string" ||
      !/^[1-9]\d*$/.test(rawLimit) ||
      !/^(0|[1-9]\d*)$/.test(rawOffset)
    ) {
      return res.status(400).json({ message: "Invalid pagination" });
    }

    const limit = Number(rawLimit);
    const offset = Number(rawOffset);

    if (limit > 100 || offset > 2147483647) {
      return res.status(400).json({ message: "Invalid pagination" });
    }

        const result = await callOrder("listOrders", {
      requester_uid: Number(req.user.uid),
      limit,
      offset,
    });

    res.json({
      items: result.items.map(toRestOrder),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:oid", async (req, res, next) => {
  try {
    const rawOid = req.params.oid;
    const oid = Number(rawOid);

    if (!/^[1-9]\d*$/.test(rawOid) || oid > 2147483647) {
      return res.status(400).json({ message: "Invalid order oid" });
    }

        const order = await callOrder("getOrder", {
      oid,
      requester_uid: Number(req.user.uid),
      requester_role: req.user.role,
    });

    res.json(toRestOrder(order));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
