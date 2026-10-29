const AppError = require("./app-error");

// Chinh sach mau MVP; tai lieu chua quy dinh cac nguong nay.
function discountBasisPointsForScore(score) {
  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 2147483647
  ) {
    throw new AppError("VALIDATION", "Invalid membership score");
  }

  if (score >= 100) return 1500;
  if (score >= 50) return 1000;
  if (score >= 10) return 500;
  return 0;
}

module.exports = { discountBasisPointsForScore };
