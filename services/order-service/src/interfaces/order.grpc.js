const grpc = require("@grpc/grpc-js");
const AppError = require("../domain/app-error");

const statusMap = {
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  CONFLICT: grpc.status.ALREADY_EXISTS,
  FORBIDDEN: grpc.status.PERMISSION_DENIED,
};

function createOrderHandlers(orderService) {
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

        console.error("Order operation failed:", error.message);

        callback({
          code: grpc.status.INTERNAL,
          details: "Internal server error",
        });
      }
    };
  }

  return {
    createOrder: handle(orderService.createOrder),
    getOrderRequest: handle(orderService.getOrderRequest),
    getOrder: handle(orderService.getOrder),
    listOrders: handle(orderService.listOrders),
  };
}

module.exports = createOrderHandlers;
