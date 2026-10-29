FROM node:24-bookworm-slim

WORKDIR /app/services/order-service

COPY services/order-service/package*.json ./
RUN npm ci --omit=dev

COPY services/order-service/src ./src
COPY proto /app/proto

ENV NODE_ENV=production
ENV PROTO_DIR=/app/proto

USER node

CMD ["node", "src/server.js"]
