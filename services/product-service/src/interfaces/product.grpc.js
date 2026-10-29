const grpc = require("@grpc/grpc-js");
const AppError = require("../domain/app-error");

const statusMap = {
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  CONFLICT: grpc.status.ALREADY_EXISTS,
};

function createProductHandlers(productService, inventoryService) {
  function handle(operation) {
    return async (call, callback) => {
      try {
        callback(null, await operation(call.request));
      } catch (error) {
        if (error instanceof AppError) {
          return callback({
            code: statusMap[error.code] || grpc.status.INTERNAL,
            details: error.message,
          });
        }

        console.error("Product operation failed:", error.message);

        callback({
          code: grpc.status.INTERNAL,
          details: "Internal server error",
        });
      }
    };
  }

  return {
    createProduct: handle(productService.createProduct),
    getProduct: handle(productService.getProduct),
    listProducts: handle(productService.listProducts),
    updateProduct: handle(productService.updateProduct),
    deleteProduct: handle(productService.deleteProduct),
    commitInventory: handle(inventoryService.commitInventory),
    reserveInventory: handle(inventoryService.reserveInventory),
    releaseInventory: handle(inventoryService.releaseInventory),
    getInventoryReservation: handle(
      inventoryService.getInventoryReservation
    ),
  };
}

module.exports = createProductHandlers;
