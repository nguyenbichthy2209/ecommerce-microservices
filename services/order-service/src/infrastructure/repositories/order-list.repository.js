const pool = require("../database/pool");
const { findByOid } = require("./order.repository");

async function listByUid(uid, limit, offset) {
  const result = await pool.query(
    `SELECT oid
     FROM orders
     WHERE uid = $1
     ORDER BY created_at DESC, oid DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset]
  );

  const items = [];

  for (const row of result.rows) {
    const order = await findByOid(row.oid);
    if (order) items.push(order);
  }

  return items;
}

module.exports = { listByUid };
