const AppError = require("../../domain/app-error");
const { Decimal128 } = require("mongodb");
const { db } = require("../database/mongo");

const products = db.collection("products");
const counters = db.collection("counters");

function toProduct(document) {
  if (!document) return null;

  return {
    pid: document.pid,
    pname: document.pname,
    price: document.price.toString(),
    quantity: document.quantity,
  };
}

async function create({ pname, price, quantity }) {
  const counter = await counters.findOneAndUpdate(
    { _id: "product_pid", seq: { $lt: 2147483647 } },
    { $inc: { seq: 1 } },
    { returnDocument: "after", includeResultMetadata: false }
  );

  if (!counter) {
    throw new Error("Product ID counter unavailable or exhausted");
  }

  const document = {
    pid: counter.seq,
    pname,
    price: Decimal128.fromString(price),
    quantity,
    reserved_quantity: 0,
    created_at: new Date(),
    updated_at: new Date(),
  };

  await products.insertOne(document);

  return toProduct(document);
}

async function findByPid(pid) {
  return toProduct(await products.findOne({ pid }));
}

async function list({ limit, offset }) {
  const documents = await products
    .find({})
    .sort({ pid: 1 })
    .skip(offset)
    .limit(limit)
    .toArray();

  return documents.map(toProduct);
}

function editableProduct(pid) {
  return {
    pid,
    $or: [
      { reserved_quantity: 0 },
      { reserved_quantity: { $exists: false } },
    ],
  };
}

async function update(pid, { pname, price, quantity }) {
  const document = await products.findOneAndUpdate(
    editableProduct(pid),
    {
      $set: {
        pname,
        price: Decimal128.fromString(price),
        quantity,
        updated_at: new Date(),
      },
    },
    { returnDocument: "after", includeResultMetadata: false }
  );

  if (!document) {
    const exists = await products.findOne({ pid });

    if (exists) {
      throw new AppError(
        "CONFLICT",
        "Cannot update a product with active reservations"
      );
    }
  }

  return toProduct(document);
}

async function remove(pid) {
  const result = await products.deleteOne(editableProduct(pid));

  if (result.deletedCount === 1) {
    return true;
  }

  const exists = await products.findOne({ pid });

  if (exists) {
    throw new AppError(
      "CONFLICT",
      "Cannot delete a product with active reservations"
    );
  }

  return false;
}

module.exports = {
  create,
  findByPid,
  list,
  update,
  remove,
};
