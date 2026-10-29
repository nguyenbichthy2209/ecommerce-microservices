const pool = require("../database/pool");

async function createNormalUser({
  username,
  email,
  phone,
  passwordHash,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `INSERT INTO users (username, email, phone, password, roleid)
       VALUES (
         $1, $2, $3, $4,
         (SELECT roleid FROM roles WHERE rolename = 'normal')
       )
       RETURNING uid, username, email, phone, created_at`,
      [username, email, phone || null, passwordHash]
    );

    const user = result.rows[0];

    await client.query(
      `INSERT INTO customer_outbox (uid) VALUES ($1)`,
      [user.uid]
    );

    await client.query("COMMIT");

    return user;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      console.error("Auth rollback failed:", rollbackError.message);
    }

    throw error;
  } finally {
    client.release();
  }
}

async function findByUsername(username) {
  const result = await pool.query(
    `SELECT u.uid, u.username, u.password, r.rolename
     FROM users u
     JOIN roles r ON r.roleid = u.roleid
     WHERE u.username = $1`,
    [username]
  );

  return result.rows[0] || null;
}

module.exports = {
  createNormalUser,
  findByUsername,
};
