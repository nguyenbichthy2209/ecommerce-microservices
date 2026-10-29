const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");

const protoPath = process.env.CUSTOMER_PROTO_PATH ||
  path.resolve(__dirname, "../../../proto/customer.proto");

const definition = loader.loadSync(protoPath, {
  keepCase: true,
  defaults: true,
});

const pkg = grpc.loadPackageDefinition(definition).customer;

const client = new pkg.CustomerService(
  process.env.CUSTOMER_GRPC_ADDRESS || "customer-service:50052",
  grpc.credentials.createInsecure()
);

function callCustomer(method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 5000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { callCustomer, client };
