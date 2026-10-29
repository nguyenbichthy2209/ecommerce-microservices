FROM node:24-bookworm-slim

WORKDIR /app/services/product-service

COPY services/product-service/package*.json ./
RUN npm ci --omit=dev

COPY services/product-service/src ./src
COPY proto/product.proto /app/proto/product.proto

ENV NODE_ENV=production
ENV PRODUCT_PROTO_PATH=/app/proto/product.proto

USER node

EXPOSE 50053

CMD ["node", "src/server.js"]
