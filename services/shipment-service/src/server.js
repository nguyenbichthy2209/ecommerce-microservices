const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const {
  client,
  db,
  connectDatabase,
} = require("./infrastructure/database/mongo");
const repository =
  require("./infrastructure/repositories/shipment.repository");
const createShipmentService = require("./application/shipment.service");
const createShipmentHandlers = require("./interfaces/shipment.grpc");

async function main() {
  const definition = loader.loadSync(
    process.env.SHIPMENT_PROTO_PATH ||
      path.resolve(__dirname, "../../../proto/shipment.proto"),
    { keepCase: true, defaults: true }
  );

  const pkg = grpc.loadPackageDefinition(definition).shipment;
  const service = createShipmentService({
    shipmentRepository: repository,
  });

  await connectDatabase();
  console.log("Shipment database connected");

  const server = new grpc.Server();

    const handlers = createShipmentHandlers(service);

  handlers.health = async (call, callback) => {
    try {
      await db.command(
        { ping: 1 },
        { timeoutMS: 2000 }
      );

      callback(null, { status: "UP" });
    } catch (error) {
      console.error("Shipment health check failed:", error.message);
      callback(null, { status: "DOWN" });
    }
  };

  server.addService(
    pkg.ShipmentService.service,
    handlers
  );

  const address = process.env.GRPC_ADDRESS || "0.0.0.0:50055";

  await new Promise((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      error => error ? reject(error) : resolve()
    );
  });

  console.log(`Shipment gRPC listening on ${address}`);

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
        console.error("Shipment shutdown failed:", error.message);
        process.exit(1);
      }
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main()
  .catch(async error => {
    console.error("Shipment startup failed:", error.message);
    process.exitCode = 1;
    await client.close();
  });
