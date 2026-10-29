const pool = require("./infrastructure/database/pool");
const services = require("./infrastructure/clients/services.client");
const { processOrderRequest } = require("./application/order.processor");

let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function processOne() {
  const connection = await pool.connect();
  let lockedId = null;
  let discardConnection = false;

  try {
    const candidates = await connection.query(
      `SELECT id
       FROM order_requests
       WHERE status IN ('PENDING', 'COMMITTING', 'CANCELLING')
         AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY next_attempt_at, id
       LIMIT 10`
    );

    for (const candidate of candidates.rows) {
      const lock = await connection.query(
        "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
        [candidate.id]
      );

      if (!lock.rows[0].acquired) continue;

      lockedId = candidate.id;

      const result = await connection.query(
        `UPDATE order_requests
         SET attempts = attempts + 1,
             next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
           AND status IN ('PENDING', 'COMMITTING', 'CANCELLING')
           AND next_attempt_at <= CURRENT_TIMESTAMP
         RETURNING *`,
        [lockedId]
      );

      const request = result.rows[0];

      if (request) {
        try {
          await processOrderRequest(request);

          console.log(JSON.stringify({
            event: "order_step_processed",
            requestId: request.id,
            fromStatus: request.status,
            attempt: request.attempts,
          }));
        } catch (error) {
          await connection.query(
            `UPDATE order_requests
             SET last_error = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
               AND status IN ('PENDING', 'COMMITTING', 'CANCELLING')`,
            [request.id, String(error.message).slice(0, 2000)]
          );

          console.error(JSON.stringify({
            event: "order_step_failed",
            requestId: request.id,
            fromStatus: request.status,
            message: error.message,
          }));
        }
      }

      return;
    }
  } finally {
    if (lockedId !== null) {
      try {
        await connection.query(
          "SELECT pg_advisory_unlock($1::bigint)",
          [lockedId]
        );
      } catch (error) {
        discardConnection = true;
        console.error("Order worker unlock failed:", error.message);
      }
    }

    connection.release(discardConnection);
  }
}

async function main() {
  await pool.query("SELECT 1");
  console.log("Order worker started");

  while (!stopping) {
    try {
      await processOne();
    } catch (error) {
      console.error("Order worker iteration failed:", error.message);
    }

    if (!stopping) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

main()
  .catch(error => {
    console.error("Order worker startup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    services.closeClients();
    await pool.end();
  });
