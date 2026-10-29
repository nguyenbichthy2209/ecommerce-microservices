const { MongoClient } = require("mongodb");

if (!process.env.MONGODB_URL) {
  throw new Error("Missing MONGODB_URL");
}

const client = new MongoClient(process.env.MONGODB_URL, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
});

const db = client.db("product_db");

async function connectDatabase() {
  await client.connect();
  await db.command({ ping: 1 });
  await db.collection("inventory_reservations").createIndex(
    { reservation_key: 1 },
    { unique: true }
  );
  await db.collection("products").createIndex(
    { pid: 1 },
    { unique: true }
  );

  await db.collection("counters").updateOne(
    { _id: "product_pid" },
    { $setOnInsert: { seq: 0 } },
    { upsert: true }
  );
}

module.exports = { client, db, connectDatabase };
