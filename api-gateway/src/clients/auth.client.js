const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");

const protoPath = process.env.AUTH_PROTO_PATH ||
  path.resolve(__dirname, "../../../proto/auth.proto");

const definition = protoLoader.loadSync(protoPath, {
  keepCase: true,
  defaults: true,
});

const pkg = grpc.loadPackageDefinition(definition).auth;

const client = new pkg.AuthService(
  process.env.AUTH_GRPC_ADDRESS || "auth-service:50051",
  grpc.credentials.createInsecure()
);

function callAuth(method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 5000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { callAuth, client };
