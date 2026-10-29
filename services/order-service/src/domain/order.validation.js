const AppError = require("./app-error");

function validateCreateOrder(input) {
  if (
    !Number.isInteger(input.uid) ||
    input.uid <= 0 ||
    input.uid > 2147483647
  ) {
    throw new AppError("VALIDATION", "Invalid customer uid");
  }

  if (
    typeof input.request_key !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.request_key)
  ) {
    throw new AppError(
      "VALIDATION",
      "Idempotency key must contain 1-100 letters, digits, underscores or hyphens"
    );
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length < 1 ||
    input.items.length > 100
  ) {
    throw new AppError("VALIDATION", "Order must contain 1-100 items");
  }

  const seen = new Set();

  const items = input.items.map((item) => {
    if (
      !item ||
      !Number.isInteger(item.pid) ||
      item.pid <= 0 ||
      item.pid > 2147483647 ||
      !Number.isInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > 2147483647
    ) {
      throw new AppError("VALIDATION", "Invalid product or quantity");
    }

    if (seen.has(item.pid)) {
      throw new AppError("VALIDATION", "Duplicate product pid");
    }

    seen.add(item.pid);
    return { pid: item.pid, qty: item.qty };
  });

  items.sort((a, b) => a.pid - b.pid);

  return {
    uid: input.uid,
    request_key: input.request_key,
    items,
    request_fingerprint: JSON.stringify(items),
  };
}

module.exports = { validateCreateOrder };
