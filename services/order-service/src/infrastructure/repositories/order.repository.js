const { randomUUID } = require("node:crypto");
const pool = require("../database/pool");
const AppError = require("../../domain/app-error");
const {
  calculateTotals,
  formatMoney,
} = require("../../domain/money");

async function prepareOrder({
  requestId,
  customer,
  reservation,
  discountBasisPoints,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT *
       FROM order_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    const request = result.rows[0];

    if (!request) {
      throw new AppError("NOT_FOUND", "Order request not found");
    }

    if (["COMMITTING", "COMPLETED"].includes(request.status)) {
      await client.query("COMMIT");
      return { oid: request.oid, status: request.status };
    }

    if (request.status !== "PENDING") {
      throw new AppError("CONFLICT", "Order request cannot be prepared");
    }

    if (
      customer.uid !== request.uid ||
      !Number.isInteger(customer.score) ||
      customer.score < 0 ||
      customer.score > 2147483647
    ) {
      throw new Error("Invalid customer snapshot");
    }

    if (
      reservation.reservation_key !== request.reservation_key ||
      reservation.status !== "RESERVED" ||
      !Array.isArray(reservation.items)
    ) {
      throw new Error("Invalid inventory reservation");
    }

    const items = [...reservation.items].sort((a, b) => a.pid - b.pid);
    const requestedItems = items.map(item => ({
      pid: item.pid,
      qty: item.qty,
    }));

    if (
      JSON.stringify(requestedItems) !== request.request_fingerprint
    ) {
      throw new Error("Reserved items do not match order request");
    }

    const totals = calculateTotals(items, discountBasisPoints);
    const discountRate = formatMoney(BigInt(discountBasisPoints));

    const orderResult = await client.query(
      `INSERT INTO orders (
         uid, request_key, status, score_snapshot,
         discount_rate, subtotal, discount, total_amount
       )
       VALUES ($1, $2, 'PENDING', $3, $4, $5, $6, $7)
       RETURNING oid, created_at`,
      [
        request.uid,
        request.request_key,
        customer.score,
        discountRate,
        totals.subtotal,
        totals.discount,
        totals.total_amount,
      ]
    );

    const oid = orderResult.rows[0].oid;

    for (const item of items) {
      await client.query(
        `INSERT INTO order_details (oid, pid, qty, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [oid, item.pid, item.qty, item.unit_price]
      );
    }
        const eventId = randomUUID();

    const payload = {
      eventId,
      eventType: "OrderCreated",
      schemaVersion: 1,
      oid,
      uid: request.uid,
      reservationKey: request.reservation_key,
      subtotal: totals.subtotal,
      discount: totals.discount,
      totalAmount: totals.total_amount,
      items,
      createdAt: orderResult.rows[0].created_at.toISOString(),
    };

    await client.query(
      `INSERT INTO outbox_events (
         event_id, oid, event_type, payload
       )
       VALUES ($1, $2, $3, $4::jsonb)`,
      [eventId, oid, "OrderCreated", JSON.stringify(payload)]
    );
    await client.query(
      `UPDATE order_requests
       SET oid = $2,
           status = 'COMMITTING',
           next_attempt_at = CURRENT_TIMESTAMP,
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [request.id, oid]
    );

    await client.query("COMMIT");

    return { oid, status: "COMMITTING" };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Prepare order rollback failed:", rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function findByOid(oid) {
  const result = await pool.query(
    `SELECT * FROM orders WHERE oid = $1`,
    [oid]
  );

  const order = result.rows[0];

  if (!order) return null;

  const details = await pool.query(
    `SELECT pid, qty, unit_price
     FROM order_details
     WHERE oid = $1
     ORDER BY pid`,
    [oid]
  );

  return {
    ...order,
    items: details.rows,
    created_at: order.created_at.toISOString(),
    updated_at: order.updated_at.toISOString(),
  };
}

module.exports = { prepareOrder, findByOid };
