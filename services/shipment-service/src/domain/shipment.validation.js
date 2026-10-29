const AppError = require("./app-error");

function validateId(value, label) {
  if (
    !Number.isInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    throw new AppError("VALIDATION", `Invalid ${label}`);
  }
}

function validateOrderCreated(event) {
  if (
    !event ||
    typeof event !== "object" ||
    Array.isArray(event) ||
    event.eventType !== "OrderCreated" ||
    event.schemaVersion !== 1 ||
    typeof event.eventId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      event.eventId
    )
  ) {
    throw new AppError("VALIDATION", "Invalid OrderCreated event");
  }

  validateId(event.oid, "order oid");
  validateId(event.uid, "customer uid");

  return {
    eventId: event.eventId,
    oid: event.oid,
    uid: event.uid,
  };
}

function validateRequester(input) {
  validateId(input.requester_uid, "requester uid");

  if (!["normal", "admin", "shipment_staff"].includes(input.requester_role)) {
    throw new AppError("FORBIDDEN", "Invalid requester role");
  }
}

module.exports = {
  validateId,
  validateOrderCreated,
  validateRequester,
};
