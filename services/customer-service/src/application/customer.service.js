const AppError = require("../domain/app-error");

function createCustomerService({ customerRepository }) {
  function validateUid(uid) {
    if (!Number.isInteger(uid) || uid <= 0 || uid > 2147483647) {
      throw new AppError("VALIDATION", "Invalid customer uid");
    }
  }

  async function ensureCustomer(input) {
    validateUid(input.uid);

    const customer = await customerRepository.ensureCustomer(input.uid);

    if (!customer) {
      throw new Error("Customer could not be initialized");
    }

    return customer;
  }

  async function getCustomer(input) {
    validateUid(input.uid);

    const customer = await customerRepository.findByUid(input.uid);

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    return customer;
  }

  async function updateCustomer(input) {
    validateUid(input.uid);

    if (typeof input.fullname !== "string") {
      throw new AppError("VALIDATION", "Fullname must be a string");
    }

    const fullname = input.fullname.trim();

    if (!fullname || [...fullname].length > 100) {
      throw new AppError(
        "VALIDATION",
        "Fullname must contain 1-100 characters"
      );
    }

        const mid = Object.hasOwn(input, "mid") ? input.mid : null;

    if (
      mid !== null &&
      (!Number.isInteger(mid) || mid <= 0 || mid > 2147483647)
    ) {
      throw new AppError("VALIDATION", "Invalid membership mid");
    }

    let customer;

    try {
      customer = await customerRepository.updateFullname(
        input.uid,
        fullname,
        mid
      );
    } catch (error) {
      if (error.code === "23503") {
        throw new AppError("NOT_FOUND", "Membership not found");
      }

      throw error;
    }

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    return customer;
  }

  return {
    ensureCustomer,
    getCustomer,
    updateCustomer,
  };
}

module.exports = createCustomerService;
