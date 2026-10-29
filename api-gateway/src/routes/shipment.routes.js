const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { callShipment } = require("../clients/shipment.client");

const router = express.Router();

router.use(authenticate);

router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

function shipmentId(req, res, next) {
  const raw = req.params.shipid;
  const shipid = Number(raw);

  if (!/^[1-9]\d*$/.test(raw) || shipid > 2147483647) {
    return res.status(400).json({ message: "Invalid shipment shipid" });
  }

  req.shipmentId = shipid;
  next();
}

router.get("/:shipid", shipmentId, async (req, res, next) => {
  try {
    res.json(await callShipment("getShipment", {
      shipid: req.shipmentId,
      requester_uid: Number(req.user.uid),
      requester_role: req.user.role,
    }));
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:shipid/status",
  authorize("admin", "shipment_staff"),
  shipmentId,
  async (req, res, next) => {
    try {
      const body = req.body;

      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some(key => key !== "status") ||
        typeof body.status !== "string"
      ) {
        return res.status(400).json({
          message: "Only a status string is accepted",
        });
      }

      res.json(await callShipment("updateShipmentStatus", {
        shipid: req.shipmentId,
        status: body.status,
        requester_uid: Number(req.user.uid),
        requester_role: req.user.role,
      }));
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
