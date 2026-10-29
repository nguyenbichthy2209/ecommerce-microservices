const AppError = require("./app-error");

function validatePid(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid > 2147483647) {
    throw new AppError("VALIDATION", "Invalid product pid");
  }
}

function validateProduct(input) {
  const pname =
    typeof input.pname === "string" ? input.pname.trim() : "";

  if (!pname || [...pname].length > 100) {
    throw new AppError(
      "VALIDATION",
      "Product name must contain 1-100 characters"
    );
  }

  if (
    typeof input.price !== "string" ||
    !/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(input.price)
  ) {
    throw new AppError(
      "VALIDATION",
      "Price must be a non-negative decimal with at most 8 integer digits and 2 decimal places"
    );
  }

  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 0 ||
    input.quantity > 2147483647
  ) {
    throw new AppError(
      "VALIDATION",
      "Quantity must be a non-negative int32"
    );
  }

  const [whole, fraction = ""] = input.price.split(".");

  return {
    pname,
    price: `${whole}.${fraction.padEnd(2, "0")}`,
    quantity: input.quantity,
  };
}

module.exports = { validatePid, validateProduct };
