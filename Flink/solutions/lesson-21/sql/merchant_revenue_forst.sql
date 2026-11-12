-- Тот же расчёт выручки, но состояние лежит в ForSt и читается асинхронно.
SET 'pipeline.name' = 'payguard-sql-forst';
SET 'state.backend.type' = 'forst';
SET 'table.exec.async-state.enabled' = 'true';

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
    'properties.group.id' = 'payguard-sql-forst',
    'scan.startup.mode' = 'latest-offset',
    'format' = 'json',
    'json.ignore-parse-errors' = 'true'
);

CREATE TABLE merchant_revenue_forst (
    merchant_id   STRING,
    payment_count BIGINT,
    amount_minor  BIGINT,
    PRIMARY KEY (merchant_id) NOT ENFORCED
) WITH (
    'connector' = 'jdbc',
    'url' = 'jdbc:postgresql://postgres:5432/payguard',
    'table-name' = 'merchant_revenue_forst',
    'username' = 'payguard',
    'password' = 'payguard'
);

INSERT INTO merchant_revenue_forst
SELECT merchantId, COUNT(*), SUM(amountMinor) FROM payments GROUP BY merchantId;
