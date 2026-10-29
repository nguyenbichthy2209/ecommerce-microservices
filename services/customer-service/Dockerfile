FROM node:24-bookworm-slim

WORKDIR /app/services/customer-service

COPY services/customer-service/package*.json ./
RUN npm ci --omit=dev

COPY services/customer-service/src ./src
COPY proto/customer.proto /app/proto/customer.proto

ENV NODE_ENV=production
ENV CUSTOMER_PROTO_PATH=/app/proto/customer.proto

USER node

EXPOSE 50052

CMD ["npm", "start"]
