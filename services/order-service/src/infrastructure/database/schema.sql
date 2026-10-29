BEGIN;

CREATE TABLE IF NOT EXISTS orders (
    oid INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid INTEGER NOT NULL CHECK (uid > 0),
    request_key VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED')),
    score_snapshot INTEGER NOT NULL CHECK (score_snapshot >= 0),
    discount_rate NUMERIC(5,2) NOT NULL
        CHECK (discount_rate BETWEEN 0 AND 100),
    subtotal NUMERIC(18,2) NOT NULL CHECK (subtotal >= 0),
    discount NUMERIC(18,2) NOT NULL CHECK (discount >= 0),
    total_amount NUMERIC(18,2) NOT NULL CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (uid, request_key),
    CHECK (discount <= subtotal),
    CHECK (total_amount = subtotal - discount)
);

CREATE TABLE IF NOT EXISTS order_details (
    oid INTEGER NOT NULL REFERENCES orders(oid),
    pid INTEGER NOT NULL CHECK (pid > 0),
    qty INTEGER NOT NULL CHECK (qty > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    PRIMARY KEY (oid, pid)
);

CREATE TABLE IF NOT EXISTS outbox_events (
    event_id UUID PRIMARY KEY,
    oid INTEGER NOT NULL REFERENCES orders(oid),
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (oid, event_type)
);

CREATE INDEX IF NOT EXISTS orders_customer_idx
ON orders (uid, created_at DESC);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
ON outbox_events (next_attempt_at)
WHERE published_at IS NULL;

COMMIT;
