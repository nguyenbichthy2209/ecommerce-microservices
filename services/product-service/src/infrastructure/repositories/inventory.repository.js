const { client, db } = require("../database/mongo");
const AppError = require("../../domain/app-error");

const products = db.collection("products");
const reservations = db.collection("inventory_reservations");

function toResponse(document) {
  return {
    reservation_key: document.reservation_key,
    status: document.status,
    items: document.items || [],
  };
}

async function transaction(operation) {
  // Thu lai khi hai request cung chen mot reservation_key.
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = client.startSession();

    try {
      return await session.withTransaction(
        () => operation(session),
        {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
          readPreference: "primary",
        }
      );
    } catch (error) {
      if (error.code === 11000 && attempt < 2) {
        continue;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}

async function reserve(input) {
  return transaction(async (session) => {
    const existing = await reservations.findOne(
      { reservation_key: input.reservation_key },
      { session }
    );

    if (existing) {
      if (existing.status === "RELEASED") {
        throw new AppError("CONFLICT", "Reservation already released");
      }

      if (existing.request_fingerprint !== input.request_fingerprint) {
        throw new AppError(
          "CONFLICT",
          "Reservation key already used with different items"
        );
      }

      return toResponse(existing);
    }

    const document = {
      reservation_key: input.reservation_key,
      request_fingerprint: input.request_fingerprint,
      status: "RESERVED",
      items: [],
      created_at: new Date(),
      updated_at: new Date(),
    };

    await reservations.insertOne(document, { session });

    for (const item of input.items) {
      const product = await products.findOneAndUpdate(
        {
          pid: item.pid,
          quantity: { $gte: item.qty },
        },
        {
          $inc: {
            quantity: -item.qty,
            reserved_quantity: item.qty,
          },
          $set: { updated_at: new Date() },
        },
        {
          session,
          returnDocument: "after",
          includeResultMetadata: false,
        }
      );

      if (!product) {
        const exists = await products.findOne(
          { pid: item.pid },
          { session }
        );

        if (!exists) {
          throw new AppError("NOT_FOUND", "Product not found");
        }

        throw new AppError(
          "CONFLICT",
          `Insufficient stock for product ${item.pid}`
        );
      }

      document.items.push({
        pid: item.pid,
        qty: item.qty,
        unit_price: product.price.toString(),
      });
    }

    await reservations.updateOne(
      { reservation_key: input.reservation_key },
      { $set: { items: document.items } },
      { session }
    );

    return toResponse(document);
  });
}

async function release(reservationKey) {
  return transaction(async (session) => {
    const existing = await reservations.findOne(
      { reservation_key: reservationKey },
      { session }
    );

    if (!existing) {
      // Ghi nhan huy de chan request giu hang den muon.
      const cancelled = {
        reservation_key: reservationKey,
        request_fingerprint: null,
        status: "RELEASED",
        items: [],
        created_at: new Date(),
        updated_at: new Date(),
      };

      await reservations.insertOne(cancelled, { session });
      return toResponse(cancelled);
    }

    if (existing.status === "RELEASED") {
      return toResponse(existing);
    }
    if (existing.status === "COMMITTED") {
      throw new AppError(
        "CONFLICT",
        "Committed reservation cannot be released"
      );
    }

    for (const item of existing.items) {
      const result = await products.updateOne(
        {
          pid: item.pid,
          quantity: { $lte: 2147483647 - item.qty },
          reserved_quantity: { $gte: item.qty },
        },
        {
          $inc: {
            quantity: item.qty,
            reserved_quantity: -item.qty,
          },
          $set: { updated_at: new Date() },
        },
        { session }
      );

      if (result.matchedCount !== 1) {
        throw new AppError(
          "CONFLICT",
          `Cannot restore stock for product ${item.pid}`
        );
      }
    }

    await reservations.updateOne(
      { reservation_key: reservationKey },
      {
        $set: {
          status: "RELEASED",
          updated_at: new Date(),
        },
      },
      { session }
    );

    return toResponse({ ...existing, status: "RELEASED" });
  });
}

async function findByKey(reservationKey) {
  const document = await reservations.findOne({
    reservation_key: reservationKey,
  });

  return document ? toResponse(document) : null;
}
async function commit(reservationKey) {
  return transaction(async (session) => {
    const existing = await reservations.findOne(
      { reservation_key: reservationKey },
      { session }
    );

    if (!existing) {
      throw new AppError("NOT_FOUND", "Inventory reservation not found");
    }

    if (existing.status === "COMMITTED") {
      return toResponse(existing);
    }

    if (existing.status !== "RESERVED") {
      throw new AppError(
        "CONFLICT",
        "Only reserved inventory can be committed"
      );
    }

    for (const item of existing.items) {
      const result = await products.updateOne(
        {
          pid: item.pid,
          reserved_quantity: { $gte: item.qty },
        },
        {
          $inc: { reserved_quantity: -item.qty },
          $set: { updated_at: new Date() },
        },
        { session }
      );

      if (result.matchedCount !== 1) {
        throw new AppError(
          "CONFLICT",
          `Cannot commit inventory for product ${item.pid}`
        );
      }
    }

    await reservations.updateOne(
      { reservation_key: reservationKey },
      {
        $set: {
          status: "COMMITTED",
          updated_at: new Date(),
        },
      },
      { session }
    );

    return toResponse({ ...existing, status: "COMMITTED" });
  });
}
module.exports = { reserve, release, commit, findByKey };
