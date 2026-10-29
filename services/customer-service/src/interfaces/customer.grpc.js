const grpc = require("@grpc/grpc-js");
const AppError = require("../domain/app-error");

const statusMap = {
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  NOT_FOUND: grpc.status.NOT_FOUND,
  CONFLICT: grpc.status.ALREADY_EXISTS,
};

function createCustomerHandlers(service) {
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

        console.error("Customer operation failed:", error.message);

        callback({
          code: grpc.status.INTERNAL,
          details: "Internal server error",
        });
      }
    };
  }

  return {
    ensureCustomer: handle(service.ensureCustomer),
    getCustomer: handle(service.getCustomer),
    updateCustomer: handle(service.updateCustomer),
    listMemberships: handle(service.listMemberships),
    getMembership: handle(service.getMembership),
    createMembership: handle(service.createMembership),
    updateMembership: handle(service.updateMembership),
    deleteMembership: handle(service.deleteMembership),
    setCustomerMembership: handle(service.setCustomerMembership),
  };
}

module.exports = createCustomerHandlers;
