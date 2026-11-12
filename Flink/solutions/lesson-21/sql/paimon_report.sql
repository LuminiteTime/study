-- Пакетный отчёт по таблице озера: тот же SQL, но запрос читает снимок и завершается.
SET 'execution.runtime-mode' = 'batch';
SET 'sql-client.execution.result-mode' = 'tableau';

CREATE CATALOG lake WITH (
    'type' = 'paimon',
    'warehouse' = 'file:/flink-data/lake'
);

SELECT rule_id, merchant_risk, COUNT(*) AS alerts
FROM lake.`default`.fraud_alerts
GROUP BY rule_id, merchant_risk
ORDER BY alerts DESC;
