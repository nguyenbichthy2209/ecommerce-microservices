const AppError = require("../domain/app-error");

function createMembershipService({ membershipRepository }) {
  function validateId(value) {
    if (
      !Number.isInteger(value) ||
      value <= 0 ||
      value > 2147483647
    ) {
      throw new AppError("VALIDATION", "Invalid identifier");
    }
  }

  function validateBody(input) {
    const mname =
      typeof input.mname === "string" ? input.mname.trim() : "";

    if (
      !mname ||
      [...mname].length > 50 ||
      !Number.isInteger(input.score) ||
      input.score < 0 ||
      input.score > 2147483647
    ) {
      throw new AppError(
        "VALIDATION",
        "Membership requires a name of 1-50 characters and a non-negative int32 score"
      );
    }

    return {
      mid: input.mid,
      mname,
      score: input.score,
    };
  }

  async function handleDatabaseError(operation) {
    try {
      return await operation();
    } catch (error) {
      if (error.code === "23505") {
        throw new AppError("CONFLICT", "Membership name already exists");
      }

      if (error.code === "23503") {
        throw new AppError(
          "CONFLICT",
          "Membership is missing or still assigned to customers"
        );
      }

      throw error;
    }
  }

  async function listMemberships() {
    return { items: await membershipRepository.list() };
  }

  async function getMembership(input) {
    validateId(input.mid);

    const membership = await membershipRepository.find(input.mid);

    if (!membership) {
      throw new AppError("NOT_FOUND", "Membership not found");
    }

    return membership;
  }

  async function createMembership(input) {
    const data = validateBody(input);

    return handleDatabaseError(() =>
      membershipRepository.create(data)
    );
  }

  async function updateMembership(input) {
    validateId(input.mid);
    const data = validateBody(input);
    const previous = await getMembership(input);

    if (previous.mname === "normal" && data.mname !== "normal") {
      throw new AppError(
        "CONFLICT",
        "The normal tier cannot be renamed"
      );
    }

    const membership = await handleDatabaseError(() =>
      membershipRepository.update(data)
    );

    if (!membership) {
      throw new AppError(
        "CONFLICT",
        "Membership changed; fetch it and retry"
      );
    }

    return membership;
  }

  async function deleteMembership(input) {
    const previous = await getMembership(input);

    if (previous.mname === "normal") {
      throw new AppError(
        "CONFLICT",
        "The normal tier cannot be deleted"
      );
    }

    const deleted = await handleDatabaseError(() =>
      membershipRepository.remove(input.mid)
    );

    if (!deleted) {
      throw new AppError("NOT_FOUND", "Membership not found");
    }

    return {
      mid: input.mid,
      message: "Membership deleted successfully",
    };
  }

  async function setCustomerMembership(input) {
    validateId(input.uid);
    validateId(input.mid);
    await getMembership(input);

    const customer = await handleDatabaseError(() =>
      membershipRepository.assign(input.uid, input.mid)
    );

    if (!customer) {
      throw new AppError("NOT_FOUND", "Customer not found");
    }

    return customer;
  }

  return {
    listMemberships,
    getMembership,
    createMembership,
    updateMembership,
    deleteMembership,
    setCustomerMembership,
  };
}

module.exports = createMembershipService;
