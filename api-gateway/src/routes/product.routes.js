const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { callProduct } = require("../clients/product.client");

const router = express.Router();

router.use(authenticate);
function toRestProduct(product) {
  return {
    ...product,
    price: Number(product.price),
  };
}
function productId(req, res, next) {
  const raw = req.params.pid;
  const pid = Number(raw);

  if (!/^[1-9]\d*$/.test(raw) || pid > 2147483647) {
    return res.status(400).json({ message: "Invalid product pid" });
  }

  req.productPid = pid;
  next();
}

function productBody(req, res, next) {
  const body = req.body;

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      key => !["pname", "price", "quantity"].includes(key)
    ) ||
    typeof body.pname !== "string" ||
    !Number.isInteger(body.quantity) ||
    !["string", "number"].includes(typeof body.price) ||
    (typeof body.price === "number" && !Number.isFinite(body.price))
  ) {
    return res.status(400).json({ message: "Invalid product fields" });
  }

  req.productInput = {
    pname: body.pname,
    price: String(body.price),
    quantity: body.quantity,
  };

  next();
}

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

        const result = await callProduct("listProducts", { limit, offset });

    res.json({
      items: result.items.map(toRestProduct),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:pid", productId, async (req, res, next) => {
  try {
        const product = await callProduct("getProduct", {
      pid: req.productPid,
    });

    res.json(toRestProduct(product));
  } catch (error) {
    next(error);
  }
});

router.post("/", authorize("admin"), productBody, async (req, res, next) => {
  try {
    const product = await callProduct("createProduct", req.productInput);
    res.status(201).json(toRestProduct(product));
  } catch (error) {
    next(error);
  }
});

router.put(
  "/:pid",
  authorize("admin"),
  productId,
  productBody,
  async (req, res, next) => {
    try {
            const product = await callProduct("updateProduct", {
        pid: req.productPid,
        ...req.productInput,
      });

      res.json({
        message: "Product updated successfully",
        pid: product.pid,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/:pid",
  authorize("admin"),
  productId,
  async (req, res, next) => {
    try {
      res.json(await callProduct("deleteProduct", {
        pid: req.productPid,
      }));
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
