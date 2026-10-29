const { createHash } = require("node:crypto");
const redis = require("../clients/redis.client");

// Tang bo dem va dat TTL trong cung mot thao tac nguyen tu.
const script = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {count, ttl}
`;

function rateLimit({ prefix, limit, windowSeconds }) {
  return async (req, res, next) => {
    if (!redis.isReady) {
      return res.status(503).json({
        message: "Rate limit service unavailable",
      });
    }

    const ipHash = createHash("sha256")
      .update(req.ip || "unknown")
      .digest("hex");

    const key = `ratelimit:${prefix}:${ipHash}`;

    let timer;

    try {
      const result = await Promise.race([
        redis.eval(script, {
          keys: [key],
          arguments: [String(windowSeconds)],
        }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Redis timeout")),
            2000
          );
        }),
      ]);

      const count = Number(result[0]);
      const ttl = Math.max(1, Number(result[1]));

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader(
        "X-RateLimit-Remaining",
        String(Math.max(0, limit - count))
      );

      if (count > limit) {
        res.setHeader("Retry-After", String(ttl));

        return res.status(429).json({
          message: "Too many requests",
          retryAfter: ttl,
        });
      }

      next();
    } catch (error) {
      console.error("Rate limit failed:", error.message);

      return res.status(503).json({
        message: "Rate limit service unavailable",
      });
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = rateLimit;
