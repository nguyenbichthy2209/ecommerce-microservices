const path = require("node:path");
const grpc = require("@grpc/grpc-js");
const loader = require("@grpc/proto-loader");
const pool = require("./infrastructure/database/pool");

const definition = loader.loadSync(
  process.env.CUSTOMER_PROTO_PATH ||
    path.resolve(__dirname, "../../../proto/customer.proto"),
  { keepCase: true, defaults: true }
);

const pkg = grpc.loadPackageDefinition(definition).customer;

const customerClient = new pkg.CustomerService(
  process.env.CUSTOMER_GRPC_ADDRESS || "customer-service:50052",
  grpc.credentials.createInsecure()
);

let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

function ensureCustomer(uid) {
  return new Promise((resolve, reject) => {
    customerClient.ensureCustomer(
      { uid },
      { deadline: Date.now() + 5000 },
      (error, result) => error ? reject(error) : resolve(result)
    );
  });
}

async function claimTask() {
  const result = await pool.query(`
    UPDATE customer_outbox AS task
    SET attempts = task.attempts + 1,
        next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '30 seconds'
    WHERE task.id = (
      SELECT id
      FROM customer_outbox
      WHERE completed_at IS NULL
        AND next_attempt_at <= CURRENT_TIMESTAMP
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING task.id, task.uid, task.attempts
  `);

  return result.rows[0] || null;
}

async function main() {
  await pool.query("SELECT 1");
  console.log("Customer provisioning worker started");

  while (!stopping) {
    let task;

    try {
      task = await claimTask();

      if (task) {
        await ensureCustomer(task.uid);

        await pool.query(
          `UPDATE customer_outbox
           SET completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [task.id]
        );

        console.log(JSON.stringify({
          event: "customer_provisioned",
          taskId: task.id,
          uid: task.uid,
          attempts: task.attempts,
        }));
      }
    } catch (error) {
      console.error(JSON.stringify({
        event: "customer_provisioning_failed",
        taskId: task ? task.id : null,
        message: error.message,
      }));
    }

    if (!stopping) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

main()
  .catch((error) => {
    console.error("Worker startup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    customerClient.close();
    await pool.end();
  });
