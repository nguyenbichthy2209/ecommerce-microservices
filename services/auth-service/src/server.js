require("dotenv").config();

const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const pool = require("./infrastructure/database/pool");
const userRepository = require("./infrastructure/repositories/user.repository");
const createAuthService = require("./application/auth.service");
const createAuthHandlers = require("./interfaces/auth.grpc");

async function main() {
  const protoPath = process.env.AUTH_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/auth.proto");

  const definition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    defaults: true,
    oneofs: true,
  });

  const authPackage = grpc.loadPackageDefinition(definition).auth;

  const authService = createAuthService({
    userRepository,
    jwtSecret: process.env.JWT_SECRET,
  });

  await pool.query("SELECT 1");
  console.log("Auth database connected");

    const handlers = createAuthHandlers(authService);

  handlers.health = async (call, callback) => {
    try {
      await pool.query({
        text: "SELECT 1",
        query_timeout: 2000,
      });

      callback(null, { status: "UP" });
    } catch (error) {
      console.error("Auth health check failed:", error.message);
      callback(null, { status: "DOWN" });
    }
  };

  const server = new grpc.Server();

  server.addService(
    authPackage.AuthService.service,
    handlers
  );

  const address = process.env.GRPC_ADDRESS || "0.0.0.0:50051";

  await new Promise((resolve, reject) => {
    server.bindAsync(
      address,
      grpc.ServerCredentials.createInsecure(),
      (error) => error ? reject(error) : resolve()
    );
  });

  console.log(`Auth gRPC listening on ${address}`);

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;

    const timer = setTimeout(() => server.forceShutdown(), 5000);
    timer.unref();

    server.tryShutdown(async () => {
      clearTimeout(timer);
      await pool.end();
      process.exit(0);
    });
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch(async (error) => {
  console.error("Auth startup failed:", error.message);
  await pool.end();
  process.exit(1);
});
