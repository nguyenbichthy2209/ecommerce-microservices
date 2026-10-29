const { db } = require("../database/mongo");

const shipments = db.collection("shipments");
const counters = db.collection("counters");

function toShipment(document) {
  if (!document) return null;

  return {
    shipid: document.shipid,
    oid: document.oid,
    uid: document.uid,
    status: document.status,
    created_at: document.created_at.toISOString(),
    updated_at: document.updated_at.toISOString(),
  };
}

async function createFromOrder(event) {
  const existing = await shipments.findOne({ oid: event.oid });

  if (existing) {
    if (existing.uid !== event.uid) {
      throw new Error("Order owner does not match existing shipment");
    }

    return toShipment(existing);
  }

  const counter = await counters.findOneAndUpdate(
    { _id: "shipment_shipid", seq: { $lt: 2147483647 } },
    { $inc: { seq: 1 } },
    { returnDocument: "after", includeResultMetadata: false }
  );

  if (!counter) {
    throw new Error("Shipment ID counter unavailable or exhausted");
  }

  const document = {
    shipid: counter.seq,
    oid: event.oid,
    uid: event.uid,
    event_id: event.eventId,
    status: "PENDING",
    created_at: new Date(),
    updated_at: new Date(),
  };

  try {
    await shipments.insertOne(document);
    return toShipment(document);
  } catch (error) {
    if (error.code !== 11000) throw error;

    const duplicate = await shipments.findOne({ oid: event.oid });

    if (!duplicate || duplicate.uid !== event.uid) {
      throw error;
    }

    return toShipment(duplicate);
  }
}

async function findByShipid(shipid) {
  return toShipment(await shipments.findOne({ shipid }));
}
async function findByOid(oid) {
  return toShipment(await shipments.findOne({ oid }));
}
async function updateStatus(shipid, expectedStatus, newStatus) {
  const document = await shipments.findOneAndUpdate(
    { shipid, status: expectedStatus },
    {
      $set: {
        status: newStatus,
        updated_at: new Date(),
      },
    },
    { returnDocument: "after", includeResultMetadata: false }
  );

  return toShipment(document);
}

module.exports = {
  createFromOrder,
  findByShipid,
  findByOid,
  updateStatus,
};
