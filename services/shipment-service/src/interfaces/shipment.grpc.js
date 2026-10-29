const grpc = require("@grpc/grpc-js");
const AppError = require("../domain/app-error");

const statusMap = {
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  FORBIDDEN: grpc.status.PERMISSION_DENIED,
  CONFLICT: grpc.status.ALREADY_EXISTS,
};

function createShipmentHandlers(service) {
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

        console.error("Shipment operation failed:", error.message);

        callback({
          code: grpc.status.INTERNAL,
          details: "Internal server error",
        });
      }
    };
  }

    return {
    getShipment: handle(service.getShipment),
    getShipmentByOrder: handle(service.getShipmentByOrder),
    updateShipmentStatus: handle(service.updateShipmentStatus),
  };
}

module.exports = createShipmentHandlers;
