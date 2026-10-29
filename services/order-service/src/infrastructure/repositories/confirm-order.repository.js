const { randomUUID } = require("node:crypto");
const pool = require("../database/pool");
const AppError = require("../../domain/app-error");
const { parseMoney } = require("../../domain/money");

async function confirmOrder({ requestId, reservation }) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const requestResult = await client.query(
      `SELECT *
       FROM order_requests
       WHERE id = $1
       FOR UPDATE`,
      [requestId]
    );

    const request = requestResult.rows[0];

    if (!request) {
      throw new AppError("NOT_FOUND", "Order request not found");
    }

    if (request.status === "COMPLETED") {
      await client.query("COMMIT");
      return { oid: request.oid, status: "COMPLETED" };
    }

    if (request.status !== "COMMITTING" || !request.oid) {
      throw new AppError("CONFLICT", "Order is not ready for confirmation");
    }

    if (
      !reservation ||
      reservation.reservation_key !== request.reservation_key ||
      reservation.status !== "COMMITTED" ||
      !Array.isArray(reservation.items)
    ) {
      throw new Error("Committed inventory reservation required");
    }

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE oid = $1 FOR UPDATE`,
      [request.oid]
    );

    const order = orderResult.rows[0];

    if (!order || order.status !== "PENDING") {
      throw new AppError("CONFLICT", "Unexpected order status");
    }

    const detailResult = await client.query(
      `SELECT pid, qty, unit_price
       FROM order_details
       WHERE oid = $1
       ORDER BY pid`,
      [order.oid]
    );

    const reservedItems = [...reservation.items]
      .sort((a, b) => a.pid - b.pid);

    if (reservedItems.length !== detailResult.rows.length) {
      throw new Error("Committed items do not match order details");
    }

    for (let index = 0; index < reservedItems.length; index++) {
      const reserved = reservedItems[index];
      const detail = detailResult.rows[index];

      if (
        reserved.pid !== detail.pid ||
        reserved.qty !== detail.qty ||
        parseMoney(reserved.unit_price) !== parseMoney(detail.unit_price)
      ) {
        throw new Error("Committed items do not match order details");
      }
    }

    await client.query(
      `UPDATE orders
       SET status = 'CONFIRMED',
           updated_at = CURRENT_TIMESTAMP
       WHERE oid = $1`,
      [order.oid]
    );

    const eventId = randomUUID();

    const payload = {
      eventId,
      eventType: "OrderCreated",
      schemaVersion: 1,
      oid: order.oid,
      uid: order.uid,
      reservationKey: request.reservation_key,
      subtotal: order.subtotal,
      discount: order.discount,
      totalAmount: order.total_amount,
      items: detailResult.rows,
      createdAt: order.created_at.toISOString(),
    };

    await client.query(
      `INSERT INTO outbox_events (
         event_id, oid, event_type, payload
       )
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (oid, event_type) DO NOTHING`,
      [eventId, order.oid, "OrderCreated", JSON.stringify(payload)]
    );

    await client.query(
      `UPDATE order_requests
       SET status = 'COMPLETED',
           last_error = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [request.id]
    );

    await client.query("COMMIT");

    return { oid: order.oid, status: "COMPLETED" };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Confirm order rollback failed:", rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = { confirmOrder };
