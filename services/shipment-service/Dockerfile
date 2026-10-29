FROM node:24-bookworm-slim

WORKDIR /app/services/shipment-service

COPY services/shipment-service/package*.json ./
RUN npm ci --omit=dev

COPY services/shipment-service/src ./src
COPY proto/shipment.proto /app/proto/shipment.proto

ENV NODE_ENV=production
ENV SHIPMENT_PROTO_PATH=/app/proto/shipment.proto

USER node

CMD ["node", "src/shipment.consumer.js"]
