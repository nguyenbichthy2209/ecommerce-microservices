FROM node:24-bookworm-slim

WORKDIR /app/api-gateway

COPY api-gateway/package*.json ./
RUN npm ci --omit=dev

COPY api-gateway/src ./src
COPY proto/auth.proto /app/proto/auth.proto
COPY proto/customer.proto /app/proto/customer.proto
COPY proto/product.proto /app/proto/product.proto
COPY proto/order.proto /app/proto/order.proto
COPY proto/shipment.proto /app/proto/shipment.proto
ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["npm", "start"]
