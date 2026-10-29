const AppError = require("../domain/app-error");
const {
  validateId,
  validateOrderCreated,
  validateRequester,
} = require("../domain/shipment.validation");

const transitions = {
  PENDING: ["SHIPPING", "CANCELLED"],
  SHIPPING: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

function createShipmentService({ shipmentRepository }) {
  async function receiveOrderCreated(event) {
    return shipmentRepository.createFromOrder(
      validateOrderCreated(event)
    );
  }

  async function loadShipment(shipid) {
    validateId(shipid, "shipment shipid");

    const shipment = await shipmentRepository.findByShipid(shipid);

    if (!shipment) {
      throw new AppError("NOT_FOUND", "Shipment not found");
    }

    return shipment;
  }

  async function getShipment(input) {
    validateRequester(input);
    const shipment = await loadShipment(input.shipid);

    if (
      !["admin", "shipment_staff"].includes(input.requester_role) &&
      shipment.uid !== input.requester_uid
    ) {
      throw new AppError("FORBIDDEN", "Forbidden shipment access");
    }

    return shipment;
  }
  async function getShipmentByOrder(input) {
    validateRequester(input);
    validateId(input.oid, "order oid");

    const shipment = await shipmentRepository.findByOid(input.oid);

    if (!shipment) {
      throw new AppError("NOT_FOUND", "Shipment not found");
    }

    if (
      !["admin", "shipment_staff"].includes(input.requester_role) &&
      shipment.uid !== input.requester_uid
    ) {
      throw new AppError("FORBIDDEN", "Forbidden shipment access");
    }

    return shipment;
  }
  async function updateShipmentStatus(input) {
    validateRequester(input);

    if (!["admin", "shipment_staff"].includes(input.requester_role)) {
      throw new AppError("FORBIDDEN", "Insufficient permissions");
    }

    if (!Object.hasOwn(transitions, input.status)) {
      throw new AppError("VALIDATION", "Invalid shipment status");
    }

    const shipment = await loadShipment(input.shipid);

    if (shipment.status === input.status) {
      return shipment;
    }

    if (!transitions[shipment.status]?.includes(input.status)) {
      throw new AppError("VALIDATION", "Invalid shipment status transition");
    }

    const updated = await shipmentRepository.updateStatus(
      shipment.shipid,
      shipment.status,
      input.status
    );

    if (!updated) {
      throw new AppError(
        "CONFLICT",
        "Shipment status changed; fetch it and retry"
      );
    }

    return updated;
  }

    return {
    receiveOrderCreated,
    getShipment,
    getShipmentByOrder,
    updateShipmentStatus,
  };
}

module.exports = createShipmentService;
