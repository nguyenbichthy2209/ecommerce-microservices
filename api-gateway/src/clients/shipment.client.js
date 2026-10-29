const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");

const definition = loader.loadSync(
  process.env.SHIPMENT_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/shipment.proto"),
  { keepCase: true, defaults: true }
);

const pkg = grpc.loadPackageDefinition(definition).shipment;

const client = new pkg.ShipmentService(
  process.env.SHIPMENT_GRPC_ADDRESS || "shipment-service:50055",
  grpc.credentials.createInsecure()
);

function callShipment(method, input, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + timeoutMs },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { callShipment, client };
