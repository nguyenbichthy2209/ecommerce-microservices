const grpc = require("@grpc/grpc-js");
const services = require("../infrastructure/clients/services.client");
const orders = require("../infrastructure/repositories/order.repository");
const {
  confirmOrder,
} = require("../infrastructure/repositories/confirm-order.repository");
const progress =
  require("../infrastructure/repositories/order-progress.repository");
const {
  discountBasisPointsForScore,
} = require("../domain/discount.policy");

async function processPending(request) {
  // Customer co the dang cho worker Auth tao ho so.
  // Loi lay Customer duoc thu lai, khong huy ngay.
  const customer = await services.getCustomer(request.uid);
  const discountBasisPoints = discountBasisPointsForScore(customer.score);

  let reservation;

  try {
    reservation = await services.reserveInventory(
      request.reservation_key,
      request.items
    );
  } catch (error) {
    if ([
      grpc.status.INVALID_ARGUMENT,
      grpc.status.NOT_FOUND,
      grpc.status.ALREADY_EXISTS,
    ].includes(error.code)) {
            const failureCode =
        error.code === grpc.status.NOT_FOUND
          ? "NOT_FOUND"
          : error.code === grpc.status.INVALID_ARGUMENT
            ? "VALIDATION"
            : "CONFLICT";

      await progress.requestCancellation(
        request.id,
        error.details || error.message,
        failureCode
      );
      return;
    }

    // Timeout/UNAVAILABLE: khong biet Product da tru ton hay chua.
    // Thu lai cung reservation_key o lan xu ly sau.
    throw error;
  }

  try {
    await orders.prepareOrder({
      requestId: request.id,
      customer,
      reservation,
      discountBasisPoints,
    });
  } catch (error) {
    if (error.code === "22003") {
      await progress.requestCancellation(
        request.id,
        "Order amount exceeds supported database limits",
        "VALIDATION"
      );
      return;
    }

    // Loi ket noi khi COMMIT co the co ket qua chua ro.
    // Lan sau doc lai trang thai da luu, khong tu dong hoan ton.
    throw error;
  }
}

async function processCommitting(request) {
  const reservation = await services.commitInventory(
    request.reservation_key
  );

  await confirmOrder({
    requestId: request.id,
    reservation,
  });
}

async function processCancelling(request) {
  await services.releaseInventory(request.reservation_key);
  await progress.finishCancellation(request.id);
}

async function processOrderRequest(request) {
  switch (request.status) {
    case "PENDING":
      return processPending(request);

    case "COMMITTING":
      return processCommitting(request);

    case "CANCELLING":
      return processCancelling(request);

    case "COMPLETED":
    case "CANCELLED":
      return;

    default:
      throw new Error("Unknown order request status");
  }
}

module.exports = { processOrderRequest };
