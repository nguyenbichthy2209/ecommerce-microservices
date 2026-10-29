const AppError = require("../domain/app-error");
const { validateCreateOrder } = require("../domain/order.validation");
const requests =
  require("../infrastructure/repositories/order-request.repository");
const orders =
  require("../infrastructure/repositories/order.repository");
const orderList =
  require("../infrastructure/repositories/order-list.repository");

function validateId(value, label) {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw new AppError("VALIDATION", `Invalid ${label}`);
  }
}

function validateRequestKey(key) {
  if (
    typeof key !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(key)
  ) {
    throw new AppError("VALIDATION", "Invalid idempotency key");
  }
}

async function submissionResponse(request) {
    const failureCode = request.failure_code || "";

  const failureMessages = {
    NOT_FOUND: "Requested product was not found",
    VALIDATION: "Invalid order data",
    CONFLICT: "Order cannot be fulfilled",
  };

  const response = {
    request_id: String(request.id),
    request_key: request.request_key,
    request_status: request.status,
    failure_code: failureCode,
    failure_message: failureMessages[failureCode] || "",
  };

  if (request.oid) {
    const order = await orders.findByOid(request.oid);

    if (!order) {
      throw new Error("Order request references a missing order");
    }

    response.order = order;
  }

  return response;
}

async function createOrder(input) {
  const validated = validateCreateOrder(input);
  const request = await requests.createOrGet(validated);
  return submissionResponse(request);
}

async function getOrderRequest(input) {
  validateId(input.requester_uid, "requester uid");
  validateRequestKey(input.request_key);

  const request = await requests.findByKey(
    input.requester_uid,
    input.request_key
  );

  if (!request) {
    throw new AppError("NOT_FOUND", "Order request not found");
  }

  return submissionResponse(request);
}

async function getOrder(input) {
  validateId(input.oid, "order oid");
  validateId(input.requester_uid, "requester uid");

  if (!["normal", "admin", "shipment_staff"].includes(input.requester_role)) {
    throw new AppError("FORBIDDEN", "Invalid requester role");
  }

  const order = await orders.findByOid(input.oid);

  if (!order) {
    throw new AppError("NOT_FOUND", "Order not found");
  }

  if (
    input.requester_role !== "admin" &&
    order.uid !== input.requester_uid
  ) {
    throw new AppError("FORBIDDEN", "Forbidden order access");
  }

  return order;
}

async function listOrders(input) {
  validateId(input.requester_uid, "requester uid");

  const limit = input.limit === 0 ? 20 : input.limit;
  const offset = input.offset;

  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 2147483647
  ) {
    throw new AppError("VALIDATION", "Invalid pagination");
  }

  return {
    items: await orderList.listByUid(
      input.requester_uid,
      limit,
      offset
    ),
  };
}

module.exports = {
  createOrder,
  getOrderRequest,
  getOrder,
  listOrders,
};
