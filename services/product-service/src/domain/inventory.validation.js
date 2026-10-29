const AppError = require("./app-error");
const { validatePid } = require("./product.validation");

function validateReservationKey(key) {
  if (
    typeof key !== "string" ||
    !/^[a-zA-Z0-9:_-]{1,150}$/.test(key)
  ) {
    throw new AppError(
      "VALIDATION",
      "Reservation key must contain 1-150 letters, digits, colons, underscores or hyphens"
    );
  }

  return key;
}

function validateReservation(input) {
  const reservationKey = validateReservationKey(input.reservation_key);

  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 100
  ) {
    throw new AppError(
      "VALIDATION",
      "Reservation must contain 1-100 product items"
    );
  }

  const seen = new Set();

  const items = input.items.map((item) => {
    if (!item || typeof item !== "object") {
      throw new AppError("VALIDATION", "Invalid inventory item");
    }

    validatePid(item.pid);

    if (
      !Number.isInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > 2147483647
    ) {
      throw new AppError("VALIDATION", "Quantity must be a positive int32");
    }

    if (seen.has(item.pid)) {
      throw new AppError("VALIDATION", "Duplicate product pid");
    }

    seen.add(item.pid);

    return { pid: item.pid, qty: item.qty };
  });

  items.sort((a, b) => a.pid - b.pid);

  return {
    reservation_key: reservationKey,
    items,
    request_fingerprint: JSON.stringify(items),
  };
}

module.exports = {
  validateReservationKey,
  validateReservation,
};
