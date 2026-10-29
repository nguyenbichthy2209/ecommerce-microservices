const AppError = require("../domain/app-error");
const {
  validatePid,
  validateProduct,
} = require("../domain/product.validation");

function createProductService({ productRepository }) {
  async function createProduct(input) {
    return productRepository.create(validateProduct(input));
  }

  async function getProduct(input) {
    validatePid(input.pid);

    const product = await productRepository.findByPid(input.pid);

    if (!product) {
      throw new AppError("NOT_FOUND", "Product not found");
    }

    return product;
  }

  async function listProducts(input) {
    const limit = input.limit === 0 ? 20 : input.limit;
    const offset = input.offset;

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError("VALIDATION", "Limit must be between 1 and 100");
    }

    if (!Number.isInteger(offset) || offset < 0) {
      throw new AppError("VALIDATION", "Offset must be non-negative");
    }

    return {
      items: await productRepository.list({ limit, offset }),
    };
  }

  async function updateProduct(input) {
    validatePid(input.pid);
    const data = validateProduct(input);

    const product = await productRepository.update(input.pid, data);

    if (!product) {
      throw new AppError("NOT_FOUND", "Product not found");
    }

    return product;
  }

  async function deleteProduct(input) {
    validatePid(input.pid);

    const deleted = await productRepository.remove(input.pid);

    if (!deleted) {
      throw new AppError("NOT_FOUND", "Product not found");
    }

    return {
      pid: input.pid,
      message: "Product deleted successfully",
    };
  }

  return {
    createProduct,
    getProduct,
    listProducts,
    updateProduct,
    deleteProduct,
  };
}

module.exports = createProductService;
