const AppError = require("../domain/app-error");
const {
  validateReservationKey,
  validateReservation,
} = require("../domain/inventory.validation");

function createInventoryService({ inventoryRepository }) {
  async function reserveInventory(input) {
    return inventoryRepository.reserve(validateReservation(input));
  }

  async function releaseInventory(input) {
    const key = validateReservationKey(input.reservation_key);
    return inventoryRepository.release(key);
  }

  async function getInventoryReservation(input) {
    const key = validateReservationKey(input.reservation_key);
    const reservation = await inventoryRepository.findByKey(key);

    if (!reservation) {
      throw new AppError("NOT_FOUND", "Inventory reservation not found");
    }

    return reservation;
  }

  async function commitInventory(input) {
    const key = validateReservationKey(input.reservation_key);
    return inventoryRepository.commit(key);
  }

  return {
    reserveInventory,
    releaseInventory,
    getInventoryReservation,
    commitInventory,
  };
}

module.exports = createInventoryService;
