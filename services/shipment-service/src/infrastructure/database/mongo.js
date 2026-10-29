const { MongoClient } = require("mongodb");

if (!process.env.MONGODB_URL) {
  throw new Error("Missing MONGODB_URL");
}

const client = new MongoClient(process.env.MONGODB_URL, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
});

const db = client.db("shipment_db");

async function connectDatabase() {
  await client.connect();
  await db.command({ ping: 1 });

  await db.collection("shipments").createIndex(
    { shipid: 1 },
    { unique: true }
  );

  await db.collection("shipments").createIndex(
    { oid: 1 },
    { unique: true }
  );

  await db.collection("shipments").createIndex(
    { event_id: 1 },
    { unique: true }
  );

  await db.collection("counters").updateOne(
    { _id: "shipment_shipid" },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );
}

module.exports = { client, db, connectDatabase };
