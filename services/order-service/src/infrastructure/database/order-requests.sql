BEGIN;

CREATE TABLE IF NOT EXISTS order_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uid INTEGER NOT NULL CHECK (uid > 0),
    request_key VARCHAR(100) NOT NULL,
    reservation_key VARCHAR(150) NOT NULL UNIQUE,
    request_fingerprint TEXT NOT NULL,
    items JSONB NOT NULL
        CHECK (jsonb_typeof(items) = 'array'),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'COMMITTING',
                'COMPLETED',
                'CANCELLING',
                'CANCELLED'
            )
        ),
    oid INTEGER UNIQUE REFERENCES orders(oid),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (uid, request_key),
    CHECK (
        status NOT IN ('COMMITTING', 'COMPLETED')
        OR oid IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS order_requests_pending_idx
ON order_requests (next_attempt_at)
WHERE status IN ('PENDING', 'COMMITTING', 'CANCELLING');

COMMIT;
