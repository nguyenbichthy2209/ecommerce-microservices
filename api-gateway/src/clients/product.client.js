const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");

const definition = loader.loadSync(
  process.env.PRODUCT_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/product.proto"),
  { keepCase: true, defaults: true }
);

const pkg = grpc.loadPackageDefinition(definition).product;

const client = new pkg.ProductService(
  process.env.PRODUCT_GRPC_ADDRESS || "product-service:50053",
  grpc.credentials.createInsecure()
);

function callProduct(method, input) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + 5000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

module.exports = { callProduct, client };
