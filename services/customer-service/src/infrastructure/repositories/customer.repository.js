const pool = require("../database/pool");

const customerQuery = `
  SELECT c.uid, c.fullname, c.mid, m.mname, m.score
  FROM customers c
  JOIN memberships m ON m.mid = c.mid
`;

async function findByUid(uid) {
  const result = await pool.query(
    `${customerQuery} WHERE c.uid = $1`,
    [uid]
  );

  return result.rows[0] || null;
}

async function ensureCustomer(uid) {
  await pool.query(
    `INSERT INTO customers (uid, fullname, mid)
     VALUES (
       $1,
       '',
       (SELECT mid FROM memberships WHERE mname = 'normal')
     )
     ON CONFLICT (uid) DO NOTHING`,
    [uid]
  );

  return findByUid(uid);
}

async function updateFullname(uid, fullname, mid = null) {
  const result = await pool.query(
    `UPDATE customers
     SET fullname = $2,
         mid = COALESCE($3::integer, mid)
     WHERE uid = $1
     RETURNING uid`,
    [uid, fullname, mid]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return findByUid(uid);
}

module.exports = {
  findByUid,
  ensureCustomer,
  updateFullname,
};
