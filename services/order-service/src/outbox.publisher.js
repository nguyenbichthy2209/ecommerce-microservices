const { Kafka, Partitioners } = require("kafkajs");
const pool = require("./infrastructure/database/pool");

const kafka = new Kafka({
  clientId: "order-outbox-publisher",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092").split(","),
  connectionTimeout: 5000,
  requestTimeout: 10000,
  retry: { retries: 3 },
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
  allowAutoTopicCreation: false,
});

let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function publishOne() {
  const connection = await pool.connect();
  let inTransaction = false;
  let discardConnection = false;

  try {
    await connection.query("BEGIN");
    inTransaction = true;

    const result = await connection.query(
      `SELECT e.*
       FROM outbox_events e
       JOIN orders o ON o.oid = e.oid
       WHERE e.published_at IS NULL
         AND e.next_attempt_at <= CURRENT_TIMESTAMP
         AND o.status = 'CONFIRMED'
       ORDER BY e.created_at, e.event_id
       LIMIT 1
       FOR UPDATE OF e SKIP LOCKED`
    );

    const event = result.rows[0];

    if (!event) {
      await connection.query("COMMIT");
      inTransaction = false;
      return;
    }

    await connection.query(
      `UPDATE outbox_events
       SET attempts = attempts + 1,
           next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '10 seconds'
       WHERE event_id = $1`,
      [event.event_id]
    );

    try {
      await producer.send({
        topic: process.env.ORDER_CREATED_TOPIC || "order-created",
        acks: -1,
        timeout: 10000,
        messages: [{
          key: String(event.oid),
          value: JSON.stringify(event.payload),
          headers: { eventId: event.event_id },
        }],
      });
    } catch (error) {
      // Luu so lan thu va lich thu lai, giu published_at rong.
      await connection.query("COMMIT");
      inTransaction = false;
      throw error;
    }

    await connection.query(
      `UPDATE outbox_events
       SET published_at = CURRENT_TIMESTAMP
       WHERE event_id = $1`,
      [event.event_id]
    );

    await connection.query("COMMIT");
    inTransaction = false;

    console.log(JSON.stringify({
      event: "outbox_published",
      eventId: event.event_id,
      oid: event.oid,
    }));
  } finally {
    if (inTransaction) {
      try {
        await connection.query("ROLLBACK");
      } catch (error) {
        discardConnection = true;
        console.error("Publisher rollback failed:", error.message);
      }
    }

    connection.release(discardConnection);
  }
}

async function main() {
  await pool.query("SELECT 1");
  await producer.connect();
  console.log("Order Outbox publisher started");

  while (!stopping) {
    try {
      await publishOne();
    } catch (error) {
      console.error("Outbox publish failed:", error.message);
    }

    if (!stopping) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

main()
  .catch(error => {
    console.error("Publisher startup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await producer.disconnect();
    } finally {
      await pool.end();
    }
  });
