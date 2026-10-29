const { Kafka } = require("kafkajs");
const {
  client,
  db,
  connectDatabase,
} = require("./infrastructure/database/mongo");
const repository =
  require("./infrastructure/repositories/shipment.repository");
const createShipmentService = require("./application/shipment.service");
const AppError = require("./domain/app-error");

const service = createShipmentService({
  shipmentRepository: repository,
});

const kafka = new Kafka({
  clientId: "shipment-consumer",
  brokers: (process.env.KAFKA_BROKERS || "kafka:9092").split(","),
  connectionTimeout: 5000,
  requestTimeout: 10000,
  retry: { retries: 3 },
});

const consumer = kafka.consumer({
  groupId: "shipment-service-v1",
  allowAutoTopicCreation: false,
});

consumer.on(consumer.events.CRASH, ({ payload }) => {
  console.error("Shipment consumer crashed:", payload.error.message);

  if (!payload.restart) {
    process.exit(1);
  }
});

async function receive({ topic, partition, message }) {
  let event;

  try {
    const raw = message.value ? message.value.toString("utf8") : "";
    try {
      event = JSON.parse(raw);
    } catch {
      throw new AppError("VALIDATION", "Invalid event JSON");
    }

    const shipment = await service.receiveOrderCreated(event);

    console.log(JSON.stringify({
      event: "shipment_created_or_existing",
      eventId: event.eventId,
      oid: shipment.oid,
      shipid: shipment.shipid,
    }));
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "VALIDATION") {
      // Loi DB/ha tang: khong danh dau message da xu ly.
      throw error;
    }

    const id = `${topic}:${partition}:${message.offset}`;

    await db.collection("rejected_events").updateOne(
      { _id: id },
      {
        $setOnInsert: {
          topic,
          partition,
          offset: message.offset,
          reason: error.message,
          raw: message.value ? message.value.toString("utf8") : null,
          created_at: new Date(),
        },
      },
      { upsert: true }
    );

    console.error(JSON.stringify({
      event: "shipment_event_rejected",
      topic,
      partition,
      offset: message.offset,
      reason: error.message,
    }));
  }
}

async function main() {
  await connectDatabase();
  console.log("Shipment database connected and indexes initialized");

  await consumer.connect();

  await consumer.subscribe({
    topic: process.env.ORDER_CREATED_TOPIC || "order-created",
    fromBeginning: true,
  });

  await consumer.run({
    eachMessage: receive,
  });

  console.log("Shipment Kafka consumer started");
}

let stopping = false;

async function shutdown() {
  if (stopping) return;
  stopping = true;

  try {
    await consumer.disconnect();
    await client.close();
  } catch (error) {
    console.error("Shipment shutdown failed:", error.message);
    process.exitCode = 1;
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch(async (error) => {
  console.error("Shipment startup failed:", error.message);
  process.exitCode = 1;
  await shutdown();
});
