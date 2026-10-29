#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env. Restore your existing .env before starting."
  exit 1
fi

docker compose config --quiet

echo "Starting databases, Redis and Kafka..."
docker compose up -d --wait \
  auth-db customer-db order-db product-db shipment-db redis

echo "Preparing Kafka volume permissions..."
MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps \
  --user 0:0 --entrypoint /bin/sh kafka \
  -c 'mkdir -p /tmp/kraft-combined-logs && chown -R 1000:1000 /tmp/kraft-combined-logs'

docker compose up -d --wait kafka

echo "Applying Auth schema..."
for file in schema.sql customer-outbox.sql; do
  docker compose exec -T auth-db sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "services/auth-service/src/infrastructure/database/$file"
done

echo "Applying Customer schema..."
docker compose exec -T customer-db sh -c \
  'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < services/customer-service/src/infrastructure/database/schema.sql

echo "Applying Order schema..."
for file in schema.sql order-requests.sql order-errors.sql; do
  docker compose exec -T order-db sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "services/order-service/src/infrastructure/database/$file"
done

echo "Initializing Product replica set..."
docker compose exec -T product-db mongosh --quiet --eval '
  try {
    rs.status();
  } catch (error) {
    if (error.code !== 94) throw error;
    const result = rs.initiate({
      _id: "product-rs",
      members: [{ _id: 0, host: "product-db:27017" }]
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
  }

  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (db.hello().isWritablePrimary) {
      ready = true;
      break;
    }
    sleep(1000);
  }

  if (!ready) throw new Error("Product PRIMARY not ready");
  print("Product replica set ready");
'

echo "Creating Kafka topic..."
MSYS_NO_PATHCONV=1 docker compose exec -T kafka \
  /opt/kafka/bin/kafka-topics.sh \
  --bootstrap-server kafka:9092 \
  --create --if-not-exists \
  --topic order-created \
  --partitions 1 \
  --replication-factor 1

echo "Building and starting applications..."
docker compose up -d --build \
  auth-service customer-service product-service order-service \
  shipment-service auth-customer-worker order-worker \
  order-outbox-publisher shipment-consumer api-gateway

echo "Waiting for Gateway, five services and Redis..."

for attempt in {1..60}; do
  if curl --fail --silent --show-error \
    --connect-timeout 2 \
    --max-time 5 \
    http://localhost:3000/api/ready \
    > /dev/null 2>&1; then

    printf '\nApplications are ready.\n'

    docker compose ps -a

    curl --fail --silent --show-error \
      --max-time 5 \
      http://localhost:3000/api/ready

    printf '\n'
    exit 0
  fi

  printf 'Waiting for readiness: %s/60\n' "$attempt"
  sleep 2
done

echo "Startup failed: applications did not become ready."

docker compose ps -a

docker compose logs --no-color --tail=30 \
  api-gateway auth-service customer-service \
  product-service order-service shipment-service

exit 1
