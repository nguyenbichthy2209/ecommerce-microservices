const inventoryRepository = require("./infrastructure/repositories/inventory.repository");
const createInventoryService = require("./application/inventory.service");
const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const {
  client,
  db,
  connectDatabase,
} = require("./infrastructure/database/mongo");
const productRepository = require("./infrastructure/repositories/product.repository");
const createProductService = require("./application/product.service");
const createProductHandlers = require("./interfaces/product.grpc");

async function main() {
  const protoPath = process.env.PRODUCT_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/product.proto");

  const definition = loader.loadSync(protoPath, {
    keepCase: true,
    defaults: true,
    oneofs: true,
  });

  const pkg = grpc.loadPackageDefinition(definition).product;

  const productService = createProductService({
    productRepository,
  });
  const inventoryService = createInventoryService({
    inventoryRepository,
  });
  await connectDatabase();
  console.log("Product database connected and indexes initialized");

  const server = new grpc.Server();

    const handlers = createProductHandlers(
    productService,
    inventoryService
  );

  handlers.health = async (call, callback) => {
    try {
      await db.command(
        { ping: 1 },
        { timeoutMS: 2000 }
      );

      callback(null, { status: "UP" });
    } catch (error) {
      console.error("Product health check failed:", error.message);
      callback(null, { status: "DOWN" });
    }
  };

  server.addService(
    pkg.ProductService.service,
    handlers
  );

  const address = process.env.GRPC_ADDRESS || "0.0.0.0:50053";

  await new Promise((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error) => error ? reject(error) : resolve()
    );
  });

  console.log(`Product gRPC listening on ${address}`);

  let stopping = false;

  function shutdown() {
    if (stopping) return;
    stopping = true;

    const timer = setTimeout(() => server.forceShutdown(), 5000);
    timer.unref();

    server.tryShutdown(async () => {
      clearTimeout(timer);

      try {
        await client.close();
        process.exit(0);
      } catch (error) {
        console.error("Product shutdown failed:", error.message);
        process.exit(1);
      }
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(async (error) => {
  console.error("Product startup failed:", error.message);

  try {
    await client.close();
  } finally {
    process.exit(1);
  }
});
