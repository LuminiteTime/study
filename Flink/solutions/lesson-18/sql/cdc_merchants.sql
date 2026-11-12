-- Изменения таблицы merchants в реальном времени: снимок плюс журнал WAL, на выходе компактируемый топик.
SET 'pipeline.name' = 'payguard-cdc-merchants';

CREATE TABLE merchants_cdc (
    merchant_id STRING,
    risk_level  STRING,
    updated_at  TIMESTAMP(6) WITH LOCAL TIME ZONE,
    PRIMARY KEY (merchant_id) NOT ENFORCED
) WITH (
    'connector' = 'postgres-cdc',
    'hostname' = 'postgres',
    'port' = '5432',
    'username' = 'payguard',
    'password' = 'payguard',
    'database-name' = 'payguard',
    'schema-name' = 'public',
    'table-name' = 'merchants',
    'slot.name' = 'payguard_merchants',
    'scan.incremental.snapshot.enabled' = 'true',
    'decoding.plugin.name' = 'pgoutput'
);

CREATE TABLE merchants_changelog (
    merchant_id STRING,
    risk_level  STRING,
    PRIMARY KEY (merchant_id) NOT ENFORCED
) WITH (
    'connector' = 'upsert-kafka',
    'topic' = 'merchants.changelog',
    'properties.bootstrap.servers' = 'kafka:9092',
    'key.format' = 'json',
    'value.format' = 'json'
);

INSERT INTO merchants_changelog SELECT merchant_id, risk_level FROM merchants_cdc;
