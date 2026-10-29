const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { callCustomer } = require("../clients/customer.client");
const redis = require("../clients/redis.client");

const router = express.Router();

router.use(authenticate, authorize("admin"));

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function validId(value) {
  return typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number(value) <= 2147483647;
}

function validBody(body) {
  return body &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    Object.keys(body).every(key => ["mname", "score"].includes(key)) &&
    typeof body.mname === "string" &&
    Number.isInteger(body.score) &&
    body.score >= 0 &&
    body.score <= 2147483647;
}

async function invalidateCustomerCache() {
  let timer;

  try {
    if (!redis.isReady) throw new Error("Redis unavailable");

    await Promise.race([
      redis.incr("cache:customer-generation"),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Cache timeout")),
          1000
        );
      }),
    ]);
  } catch (error) {
    console.error("Membership cache invalidation failed:", error.message);
  } finally {
    clearTimeout(timer);
  }
}

router.get("/memberships", async (req, res, next) => {
  try {
    res.json(await callCustomer("listMemberships", {}));
  } catch (error) {
    next(error);
  }
});

router.get("/memberships/:mid", async (req, res, next) => {
  try {
    if (!validId(req.params.mid)) {
      return res.status(400).json({ message: "Invalid membership id" });
    }

    res.json(await callCustomer("getMembership", {
      mid: Number(req.params.mid),
    }));
  } catch (error) {
    next(error);
  }
});

router.post("/memberships", async (req, res, next) => {
  try {
    if (!validBody(req.body)) {
      return res.status(400).json({ message: "Invalid membership fields" });
    }

    const result = await callCustomer("createMembership", {
      mname: req.body.mname,
      score: req.body.score,
    });

    await invalidateCustomerCache();
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.put("/memberships/:mid", async (req, res, next) => {
  try {
    if (!validId(req.params.mid) || !validBody(req.body)) {
      return res.status(400).json({ message: "Invalid membership fields" });
    }

    const result = await callCustomer("updateMembership", {
      mid: Number(req.params.mid),
      mname: req.body.mname,
      score: req.body.score,
    });

    await invalidateCustomerCache();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.delete("/memberships/:mid", async (req, res, next) => {
  try {
    if (!validId(req.params.mid)) {
      return res.status(400).json({ message: "Invalid membership id" });
    }

    const result = await callCustomer("deleteMembership", {
      mid: Number(req.params.mid),
    });

    await invalidateCustomerCache();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/customers/:uid/membership", async (req, res, next) => {
  try {
    const body = req.body;

    if (
      !validId(req.params.uid) ||
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(key => key !== "mid") ||
      !Number.isInteger(body.mid) ||
      body.mid < 1 ||
      body.mid > 2147483647
    ) {
      return res.status(400).json({ message: "A valid mid is required" });
    }

    const result = await callCustomer("setCustomerMembership", {
      uid: Number(req.params.uid),
      mid: body.mid,
    });

    await invalidateCustomerCache();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
