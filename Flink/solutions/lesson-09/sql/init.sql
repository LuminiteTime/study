CREATE TABLE merchants (
    merchant_id TEXT PRIMARY KEY,
    risk_level  TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO merchants (merchant_id, risk_level)
SELECT 'm-' || lpad(n::text, 4, '0'),
       CASE WHEN n % 10 = 0 THEN 'HIGH' WHEN n % 3 = 0 THEN 'MEDIUM' ELSE 'LOW' END
FROM generate_series(0, 49) AS n;
