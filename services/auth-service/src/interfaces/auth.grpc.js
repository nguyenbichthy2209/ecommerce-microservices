const grpc = require("@grpc/grpc-js");
const AppError = require("../domain/app-error");

const statusMap = {
  VALIDATION: grpc.status.INVALID_ARGUMENT,
  CONFLICT: grpc.status.ALREADY_EXISTS,
  UNAUTHENTICATED: grpc.status.UNAUTHENTICATED,
};

function createAuthHandlers(authService) {
  function handle(operation) {
    return async (call, callback) => {
      try {
        const result = await operation(call.request);
        callback(null, result);
      } catch (error) {
        if (error instanceof AppError) {
          return callback({
            code: statusMap[error.code] || grpc.status.INTERNAL,
            details: error.message,
          });
        }

        console.error("Auth operation failed:", error.message);
        callback({
          code: grpc.status.INTERNAL,
          details: "Internal server error",
        });
      }
    };
  }

  return {
    register: handle(authService.register),
    login: handle(authService.login),
  };
}

module.exports = createAuthHandlers;
