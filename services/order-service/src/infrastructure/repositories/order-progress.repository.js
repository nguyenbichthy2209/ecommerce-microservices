const pool = require("../database/pool");

async function requestCancellation(
  id,
  message,
  failureCode = "CONFLICT"
) {
  await pool.query(
    `UPDATE order_requests
     SET status = 'CANCELLING',
         last_error = $2,
         failure_code = $3,
         next_attempt_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'PENDING'`,
    [id, String(message).slice(0, 2000), failureCode]
  );
}

async function finishCancellation(id) {
  await pool.query(
    `UPDATE order_requests
     SET status = 'CANCELLED',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'CANCELLING'`,
    [id]
  );
}

module.exports = {
  requestCancellation,
  finishCancellation,
};
