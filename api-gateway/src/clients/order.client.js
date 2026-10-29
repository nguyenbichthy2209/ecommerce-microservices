const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");

const definition = loader.loadSync(
  process.env.ORDER_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/order.proto"),
  { keepCase: true, defaults: true }
);

const pkg = grpc.loadPackageDefinition(definition).order;

const client = new pkg.OrderService(
  process.env.ORDER_GRPC_ADDRESS || "order-service:50054",
  grpc.credentials.createInsecure()
);

function callOrder(method, input, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + timeoutMs },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { callOrder, client };
