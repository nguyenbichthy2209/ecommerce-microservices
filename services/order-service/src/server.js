const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const pool = require("./infrastructure/database/pool");
const orderService = require("./application/order.service");
const createOrderHandlers = require("./interfaces/order.grpc");

async function main() {
  const protoDir = process.env.PROTO_DIR ||
    path.resolve(__dirname, "../../../proto");

  const definition = loader.loadSync(
    path.join(protoDir, "order.proto"),
    {
      keepCase: true,
      defaults: true,
      oneofs: true,
    }
  );

  const pkg = grpc.loadPackageDefinition(definition).order;

  await pool.query("SELECT 1");
  console.log("Order database connected");

  const server = new grpc.Server();

    const handlers = createOrderHandlers(orderService);

  handlers.health = async (call, callback) => {
    try {
      await pool.query({
        text: "SELECT 1",
        query_timeout: 2000,
      });

      callback(null, { status: "UP" });
    } catch (error) {
      console.error("Order health check failed:", error.message);
      callback(null, { status: "DOWN" });
    }
  };

  server.addService(
    pkg.OrderService.service,
    handlers
  );

  const address = process.env.GRPC_ADDRESS || "0.0.0.0:50054";

  await new Promise((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      error => error ? reject(error) : resolve()
    );
  });

  console.log(`Order gRPC listening on ${address}`);

  let stopping = false;

  function shutdown() {
    if (stopping) return;
    stopping = true;

    const timer = setTimeout(() => server.forceShutdown(), 5000);
    timer.unref();

    server.tryShutdown(async () => {
      clearTimeout(timer);

      try {
        await pool.end();
        process.exit(0);
      } catch (error) {
        console.error("Order shutdown failed:", error.message);
        process.exit(1);
      }
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main()
  .catch(error => {
    console.error("Order startup failed:", error.message);
    process.exitCode = 1;
    return pool.end();
  });
