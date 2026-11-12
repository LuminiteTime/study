-- Алерты из Kafka в таблицу озера данных. Первичный ключ убирает повторы при перезапусках.
SET 'pipeline.name' = 'payguard-alerts-lake';

CREATE CATALOG lake WITH (
    'type' = 'paimon',
    'warehouse' = 'file:/flink-data/lake'
);

CREATE TABLE IF NOT EXISTS lake.`default`.fraud_alerts (
    alert_id      STRING,
    rule_id       STRING,
    card_id       STRING,
    merchant_id   STRING,
    merchant_risk STRING,
    event_day     STRING,
    event_time    TIMESTAMP(3),
    PRIMARY KEY (event_day, alert_id) NOT ENFORCED
) PARTITIONED BY (event_day) WITH (
    'bucket' = '2',
    'changelog-producer' = 'input'
);

CREATE TEMPORARY TABLE alerts_topic (
    alertId      STRING,
    ruleId       STRING,
    cardId       STRING,
    merchantId   STRING,
    merchantRisk STRING,
    eventTimeMs  BIGINT
) WITH (
    'connector' = 'kafka',
    'topic' = 'fraud.alerts',
    'properties.bootstrap.servers' = 'kafka:9092',
    'properties.group.id' = 'payguard-alerts-lake',
    'properties.isolation.level' = 'read_committed',
    'scan.startup.mode' = 'earliest-offset',
    'format' = 'json'
);

INSERT INTO lake.`default`.fraud_alerts
SELECT alertId, ruleId, cardId, merchantId, merchantRisk,
       DATE_FORMAT(TO_TIMESTAMP_LTZ(eventTimeMs, 3), 'yyyy-MM-dd'),
       CAST(TO_TIMESTAMP_LTZ(eventTimeMs, 3) AS TIMESTAMP(3))
FROM alerts_topic;
