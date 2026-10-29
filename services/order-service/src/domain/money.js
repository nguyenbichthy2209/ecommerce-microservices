const MAX_AMOUNT = 999999999999999999n;

function parseMoney(value) {
  if (
    typeof value !== "string" ||
    !/^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value)
  ) {
    throw new Error("Invalid monetary amount");
  }

  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, "0"));

  if (amount > MAX_AMOUNT) {
    throw new Error("Monetary amount exceeds NUMERIC(18,2)");
  }

  return amount;
}

function formatMoney(amount) {
  if (
    typeof amount !== "bigint" ||
    amount < 0n ||
    amount > MAX_AMOUNT
  ) {
    throw new Error("Invalid monetary amount");
  }

  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}

function calculateTotals(items, discountBasisPoints) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Order must contain items");
  }

  if (
    !Number.isInteger(discountBasisPoints) ||
    discountBasisPoints < 0 ||
    discountBasisPoints > 10000
  ) {
    throw new Error("Invalid discount rate");
  }

  let subtotal = 0n;

  for (const item of items) {
    if (
      !Number.isInteger(item.qty) ||
      item.qty <= 0 ||
      item.qty > 2147483647
    ) {
      throw new Error("Invalid order quantity");
    }

    subtotal += parseMoney(item.unit_price) * BigInt(item.qty);
  }

  if (subtotal > MAX_AMOUNT) {
    throw new Error("Order subtotal exceeds NUMERIC(18,2)");
  }

  // Lam tron half-up den don vi 0.01.
  const discount =
    (subtotal * BigInt(discountBasisPoints) + 5000n) / 10000n;

  return {
    subtotal: formatMoney(subtotal),
    discount: formatMoney(discount),
    total_amount: formatMoney(subtotal - discount),
  };
}

module.exports = {
  parseMoney,
  formatMoney,
  calculateTotals,
};
