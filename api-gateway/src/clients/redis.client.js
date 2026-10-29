const { createClient } = require("redis");

const redis = createClient({
  url: process.env.REDIS_URL || "redis://redis:6379",
  disableOfflineQueue: true,
  socket: {
    connectTimeout: 5000,
  },
});

redis.on("error", (error) => {
  console.error("Redis connection error:", error.message);
});

module.exports = redis;
