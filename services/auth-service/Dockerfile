FROM node:24-bookworm-slim

WORKDIR /app/services/auth-service

COPY services/auth-service/package*.json ./
RUN npm ci --omit=dev

COPY services/auth-service/src ./src
COPY proto/auth.proto /app/proto/auth.proto
COPY proto/customer.proto /app/proto/customer.proto
ENV NODE_ENV=production
ENV AUTH_PROTO_PATH=/app/proto/auth.proto

USER node

EXPOSE 50051

CMD ["npm", "start"]
