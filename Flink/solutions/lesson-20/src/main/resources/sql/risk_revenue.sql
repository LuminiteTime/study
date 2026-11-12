-- Выручка по уровню риска продавца. Обогащение идёт через lookup join с кэшем.
CREATE TABLE payments (
    paymentId   STRING,
    cardId      STRING,
    merchantId  STRING,
    amountMinor BIGINT,
    currency    STRING,
    country     STRING,
    eventTimeMs BIGINT,
    event_time  AS TO_TIMESTAMP_LTZ(eventTimeMs, 3),
    proc_time   AS PROCTIME(),
    WATERMARK FOR event_time AS event_time - INTERVAL '10' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'payments.raw',
    'properties.bootstrap.servers' = 'kafka:9092',
    'properties.group.id' = 'payguard-risk-sql',
    'scan.startup.mode' = 'latest-offset',
    'format' = 'json',
    'json.ignore-parse-errors' = 'true'
);

CREATE TABLE merchants (
    merchant_id STRING,
    risk_level  STRING,
    PRIMARY KEY (merchant_id) NOT ENFORCED
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://postgres:5432/payguard',
    'table-name' = 'merchants',
    'username' = 'payguard',
    'password' = 'payguard',
    'lookup.cache' = 'PARTIAL',
    'lookup.partial-cache.max-rows' = '10000',
    'lookup.partial-cache.expire-after-write' = '5min'
);

CREATE TABLE risk_revenue (
    risk_level   STRING,
    window_start TIMESTAMP(3),
    top_rank     BIGINT,
    merchant_id  STRING,
    amount_minor BIGINT,
    PRIMARY KEY (risk_level, window_start, top_rank) NOT ENFORCED
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://postgres:5432/payguard',
    'table-name' = 'risk_revenue',
    'username' = 'payguard',
    'password' = 'payguard'
);

CREATE TEMPORARY VIEW enriched AS
SELECT p.merchantId, p.amountMinor, p.event_time, COALESCE(m.risk_level, 'UNKNOWN') AS risk_level
FROM payments AS p
LEFT JOIN merchants FOR SYSTEM_TIME AS OF p.proc_time AS m
    ON p.merchantId = m.merchant_id;

INSERT INTO risk_revenue
SELECT risk_level, window_start, top_rank, merchantId, amount_minor
FROM (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY risk_level, window_start, window_end ORDER BY amount_minor DESC) AS top_rank
    FROM (
        SELECT risk_level, merchantId, window_start, window_end, SUM(amountMinor) AS amount_minor
        FROM TABLE(TUMBLE(TABLE enriched, DESCRIPTOR(event_time), INTERVAL '1' MINUTE))
        GROUP BY risk_level, merchantId, window_start, window_end
    )
)
WHERE top_rank <= 3;
