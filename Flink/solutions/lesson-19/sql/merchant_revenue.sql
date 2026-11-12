-- Выручка продавцов по минутам: из Kafka в PostgreSQL чистым SQL.
SET 'pipeline.name' = 'payguard-sql-revenue';

CREATE TABLE payments (
    paymentId   STRING,
    cardId      STRING,
    merchantId  STRING,
    amountMinor BIGINT,
    currency    STRING,
    country     STRING,
    eventTimeMs BIGINT,
    event_time  AS TO_TIMESTAMP_LTZ(eventTimeMs, 3),
    WATERMARK FOR event_time AS event_time - INTERVAL '10' SECOND
) WITH (
    'connector' = 'kafka',
    'topic' = 'payments.raw',
    'properties.bootstrap.servers' = 'kafka:9092',
    'properties.group.id' = 'payguard-sql',
    'scan.startup.mode' = 'latest-offset',
    'format' = 'json',
    'json.ignore-parse-errors' = 'true'
);

CREATE TABLE merchant_revenue_1m (
    merchant_id   STRING,
    window_start  TIMESTAMP(3),
    payment_count BIGINT,
    amount_minor  BIGINT,
    PRIMARY KEY (merchant_id, window_start) NOT ENFORCED
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://postgres:5432/payguard',
    'table-name' = 'merchant_revenue_1m',
    'username' = 'payguard',
    'password' = 'payguard'
);

INSERT INTO merchant_revenue_1m
SELECT merchantId, window_start, COUNT(*), SUM(amountMinor)
FROM TABLE(TUMBLE(TABLE payments, DESCRIPTOR(event_time), INTERVAL '1' MINUTE))
GROUP BY merchantId, window_start, window_end;
