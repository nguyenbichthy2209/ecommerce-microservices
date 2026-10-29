const redis = require("./clients/redis.client");

const services = {
  auth: require("./clients/auth.client").client,
  customer: require("./clients/customer.client").client,
  product: require("./clients/product.client").client,
  order: require("./clients/order.client").client,
  shipment: require("./clients/shipment.client").client,
};

function checkService(client) {
  return new Promise(resolve => {
    try {
      client.health(
        {},
        { deadline: Date.now() + 3000 },
        (error, result) => {
          resolve(!error && result?.status === "UP" ? "UP" : "DOWN");
        }
      );
    } catch {
      resolve("DOWN");
    }
  });
}

async function checkRedis() {
  if (!redis.isReady) return "DOWN";

  let timer;

  try {
    const pong = await Promise.race([
      redis.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Redis health timeout")),
          3000
        );
      }),
    ]);

    return pong === "PONG" ? "UP" : "DOWN";
  } catch {
    return "DOWN";
  } finally {
    clearTimeout(timer);
  }
}

async function health(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const results = await Promise.all([
    ...Object.entries(services).map(async ([name, client]) => [
      name,
      await checkService(client),
    ]),
    checkRedis().then(status => ["redis", status]),
  ]);

  const dependencies = Object.fromEntries(results);
  const healthy = Object.values(dependencies).every(
    status => status === "UP"
  );

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "UP" : "DOWN",
    message: healthy
      ? "E-commerce API is running"
      : "Required dependency unavailable",
    dependencies,
  });
}

module.exports = health;
