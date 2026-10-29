const { randomUUID } = require("node:crypto");
const pool = require("../database/pool");
const AppError = require("../../domain/app-error");

async function findByKey(uid, requestKey) {
  const result = await pool.query(
    `SELECT *
     FROM order_requests
     WHERE uid = $1 AND request_key = $2`,
    [uid, requestKey]
  );

  return result.rows[0] || null;
}

async function createOrGet(input) {
  const result = await pool.query(
    `INSERT INTO order_requests (
       uid, request_key, reservation_key,
       request_fingerprint, items
     )
     VALUES ($1, $2, $3, $4, $5::jsonb)
     ON CONFLICT (uid, request_key) DO NOTHING
     RETURNING *`,
    [
      input.uid,
      input.request_key,
      `order:${randomUUID()}`,
      input.request_fingerprint,
      JSON.stringify(input.items),
    ]
  );

  const request = result.rows[0] ||
    await findByKey(input.uid, input.request_key);

  if (!request) {
    throw new Error("Order request could not be loaded");
  }

  if (request.request_fingerprint !== input.request_fingerprint) {
    throw new AppError(
      "CONFLICT",
      "Idempotency key already used with different items"
    );
  }

  return request;
}

module.exports = { createOrGet, findByKey };
