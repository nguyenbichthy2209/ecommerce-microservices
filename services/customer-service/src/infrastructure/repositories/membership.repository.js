const pool = require("../database/pool");
const customerRepository = require("./customer.repository");

async function list() {
  const result = await pool.query(
    "SELECT mid, mname, score FROM memberships ORDER BY mid"
  );

  return result.rows;
}

async function find(mid) {
  const result = await pool.query(
    "SELECT mid, mname, score FROM memberships WHERE mid = $1",
    [mid]
  );

  return result.rows[0] || null;
}

async function create({ mname, score }) {
  const result = await pool.query(
    `INSERT INTO memberships (mname, score)
     VALUES ($1, $2)
     RETURNING mid, mname, score`,
    [mname, score]
  );

  return result.rows[0];
}

async function update({ mid, mname, score }) {
  const result = await pool.query(
    `UPDATE memberships
     SET mname = $2, score = $3
     WHERE mid = $1
       AND (mname <> 'normal' OR $2 = 'normal')
     RETURNING mid, mname, score`,
    [mid, mname, score]
  );

  return result.rows[0] || null;
}

async function remove(mid) {
  const result = await pool.query(
    `DELETE FROM memberships
     WHERE mid = $1 AND mname <> 'normal'
     RETURNING mid`,
    [mid]
  );

  return result.rows[0] || null;
}

async function assign(uid, mid) {
  const result = await pool.query(
    `UPDATE customers
     SET mid = $2
     WHERE uid = $1
     RETURNING uid`,
    [uid, mid]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return customerRepository.findByUid(uid);
}

module.exports = {
  list,
  find,
  create,
  update,
  remove,
  assign,
};
