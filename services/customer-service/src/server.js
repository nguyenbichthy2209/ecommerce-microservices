const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const pool = require("./infrastructure/database/pool");

const customerRepository =
  require("./infrastructure/repositories/customer.repository");
const membershipRepository =
  require("./infrastructure/repositories/membership.repository");

const createCustomerService = require("./application/customer.service");
const createMembershipService = require("./application/membership.service");
const createCustomerHandlers = require("./interfaces/customer.grpc");

async function main() {
  const protoPath = process.env.CUSTOMER_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/customer.proto");

  const definition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    defaults: true,
    oneofs: true,
  });

  const customerPackage =
    grpc.loadPackageDefinition(definition).customer;

  const customerService = createCustomerService({
    customerRepository,
  });

  const membershipService = createMembershipService({
    membershipRepository,
  });

  Object.assign(customerService, membershipService);

  await pool.query("SELECT 1");
  console.log("Customer database connected");

  const server = new grpc.Server();

    const handlers = createCustomerHandlers(customerService);

  handlers.health = async (call, callback) => {
    try {
      await pool.query({
        text: "SELECT 1",
        query_timeout: 2000,
      });

      callback(null, { status: "UP" });
    } catch (error) {
      console.error("Customer health check failed:", error.message);
      callback(null, { status: "DOWN" });
    }
  };

  server.addService(
    customerPackage.CustomerService.service,
    handlers
  );

  const address = process.env.GRPC_ADDRESS || "0.0.0.0:50052";

  await new Promise((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      error => error ? reject(error) : resolve()
    );
  });

  console.log(`Customer gRPC listening on ${address}`);

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
        console.error("Customer shutdown failed:", error.message);
        process.exit(1);
      }
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(async error => {
  console.error("Customer startup failed:", error.message);

  try {
    await pool.end();
  } finally {
    process.exit(1);
  }
});
