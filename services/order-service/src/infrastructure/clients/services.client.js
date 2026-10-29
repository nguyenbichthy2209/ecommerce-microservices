const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");

const protoDir = process.env.PROTO_DIR ||
  path.resolve(__dirname, "../../../../../proto");

function loadPackage(filename, packageName) {
  const definition = loader.loadSync(
    path.join(protoDir, filename),
    {
      keepCase: true,
      defaults: true,
      oneofs: true,
    }
  );

  return grpc.loadPackageDefinition(definition)[packageName];
}

const customerPackage = loadPackage("customer.proto", "customer");
const productPackage = loadPackage("product.proto", "product");

const customerClient = new customerPackage.CustomerService(
  process.env.CUSTOMER_GRPC_ADDRESS || "customer-service:50052",
  grpc.credentials.createInsecure()
);

const productClient = new productPackage.ProductService(
  process.env.PRODUCT_GRPC_ADDRESS || "product-service:50053",
  grpc.credentials.createInsecure()
);

function call(client, method, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    client[method](
      input,
      { deadline: Date.now() + timeoutMs },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

function getCustomer(uid) {
  return call(customerClient, "getCustomer", { uid }, 5000);
}

function reserveInventory(reservationKey, items) {
  return call(productClient, "reserveInventory", {
    reservation_key: reservationKey,
    items,
  }, 10000);
}

function getInventoryReservation(reservationKey) {
  return call(productClient, "getInventoryReservation", {
    reservation_key: reservationKey,
  }, 5000);
}

function releaseInventory(reservationKey) {
  return call(productClient, "releaseInventory", {
    reservation_key: reservationKey,
  }, 10000);
}

function commitInventory(reservationKey) {
  return call(productClient, "commitInventory", {
    reservation_key: reservationKey,
  }, 10000);
}

function closeClients() {
  customerClient.close();
  productClient.close();
}

module.exports = {
  getCustomer,
  reserveInventory,
  getInventoryReservation,
  releaseInventory,
  commitInventory,
  closeClients,
};
