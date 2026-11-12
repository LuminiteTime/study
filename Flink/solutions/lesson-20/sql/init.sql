CREATE TABLE merchants (
    merchant_id TEXT PRIMARY KEY,
    risk_level  TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CDC-коннектору нужны прежние значения строки в журнале, иначе UPDATE ломает задание.
ALTER TABLE merchants REPLICA IDENTITY FULL;

INSERT INTO merchants (merchant_id, risk_level)
SELECT 'm-' || lpad(n::text, 4, '0'),
       CASE WHEN n % 10 = 0 THEN 'HIGH' WHEN n % 3 = 0 THEN 'MEDIUM' ELSE 'LOW' END
FROM generate_series(0, 49) AS n;

CREATE TABLE merchant_stats (
    merchant_id     TEXT   NOT NULL,
    window_start_ms BIGINT NOT NULL,
    window_end_ms   BIGINT NOT NULL,
    payment_count   BIGINT NOT NULL,
    amount_minor    BIGINT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (merchant_id, window_start_ms)
);

CREATE TABLE merchant_revenue_1m (
    merchant_id   TEXT NOT NULL,
    window_start  TIMESTAMP NOT NULL,
    payment_count BIGINT NOT NULL,
    amount_minor  BIGINT NOT NULL,
    PRIMARY KEY (merchant_id, window_start)
);

CREATE TABLE risk_revenue (
    risk_level   TEXT NOT NULL,
    window_start TIMESTAMP NOT NULL,
    top_rank     BIGINT NOT NULL,
    merchant_id  TEXT NOT NULL,
    amount_minor BIGINT NOT NULL,
    PRIMARY KEY (risk_level, window_start, top_rank)
);

CREATE TABLE merchant_revenue_forst (
    merchant_id   TEXT PRIMARY KEY,
    payment_count BIGINT NOT NULL,
    amount_minor  BIGINT NOT NULL
);
