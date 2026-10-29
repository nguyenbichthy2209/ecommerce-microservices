const grpc = require("@grpc/grpc-js");
const { callOrder } = require("../clients/order.client");
const { callShipment } = require("../clients/shipment.client");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function rpcError(code, details) {
  const error = new Error(details);
  error.code = code;
  error.details = details;
  return error;
}

function toRestOrder(order, shipment) {
  return {
    ...order,
    discount_rate: Number(order.discount_rate),
    subtotal: Number(order.subtotal),
    discount: Number(order.discount),
    total_amount: Number(order.total_amount),
    items: order.items.map(item => ({
      ...item,
      unit_price: Number(item.unit_price),
    })),
    shipment: {
      shipid: shipment.shipid,
      status: shipment.status,
    },
  };
}

async function waitOrder({
  initial,
  uid,
  requestKey,
  timeoutMs = 45000,
}) {
  const deadline = Date.now() + timeoutMs;
  let progress = initial;

  while (Date.now() < deadline) {
        if (progress.request_status === "CANCELLED") {
      const failureStatuses = {
        NOT_FOUND: grpc.status.NOT_FOUND,
        VALIDATION: grpc.status.INVALID_ARGUMENT,
        CONFLICT: grpc.status.ALREADY_EXISTS,
      };

      throw rpcError(
        failureStatuses[progress.failure_code] ||
          grpc.status.ALREADY_EXISTS,
        progress.failure_message || "Order request was cancelled"
      );
    }

    if (progress.request_status === "COMPLETED") {
      const order = progress.order;

      if (!order || order.status !== "CONFIRMED") {
        throw new Error("Completed request has no confirmed order");
      }

      try {
        const shipment = await callShipment(
          "getShipmentByOrder",
          {
            oid: order.oid,
            requester_uid: uid,
            requester_role: "normal",
          },
          Math.max(1, Math.min(5000, deadline - Date.now()))
        );

        if (shipment.oid !== order.oid || shipment.uid !== uid) {
          throw new Error("Shipment does not match order");
        }

        return toRestOrder(order, shipment);
      } catch (error) {
        if (![
          grpc.status.NOT_FOUND,
          grpc.status.UNAVAILABLE,
          grpc.status.DEADLINE_EXCEEDED,
        ].includes(error.code)) {
          throw error;
        }
      }
    }

    if (Date.now() >= deadline) break;

    await sleep(500);

    const remaining = deadline - Date.now();
    if (remaining <= 0) break;

    try {
      progress = await callOrder(
        "getOrderRequest",
        {
          requester_uid: uid,
          request_key: requestKey,
        },
        Math.min(10000, remaining)
      );
    } catch (error) {
      if (![
        grpc.status.UNAVAILABLE,
        grpc.status.DEADLINE_EXCEEDED,
      ].includes(error.code)) {
        throw error;
      }
    }
  }

  throw rpcError(
    grpc.status.UNAVAILABLE,
    "Order result is not ready; retry with the same Idempotency-Key"
  );
}

module.exports = waitOrder;
