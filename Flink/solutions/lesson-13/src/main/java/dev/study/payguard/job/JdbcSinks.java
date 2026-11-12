package dev.study.payguard.job;

import dev.study.payguard.model.MerchantStats;
import org.apache.flink.connector.jdbc.JdbcConnectionOptions;
import org.apache.flink.connector.jdbc.JdbcExecutionOptions;
import org.apache.flink.connector.jdbc.core.datastream.sink.JdbcSink;

/** Приёмники PostgreSQL. Повторная запись той же строки безопасна благодаря ON CONFLICT. */
final class JdbcSinks {

    private static final String UPSERT_MERCHANT_STATS = """
            INSERT INTO merchant_stats (merchant_id, window_start_ms, window_end_ms, payment_count, amount_minor)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (merchant_id, window_start_ms) DO UPDATE
            SET payment_count = EXCLUDED.payment_count,
                amount_minor = EXCLUDED.amount_minor,
                updated_at = now()
            """;

    static JdbcSink<MerchantStats> merchantStats() {
        return JdbcSink.<MerchantStats>builder()
                .withQueryStatement(UPSERT_MERCHANT_STATS, (statement, stats) -> {
                    statement.setString(1, stats.merchantId());
                    statement.setLong(2, stats.windowStartMs());
                    statement.setLong(3, stats.windowEndMs());
                    statement.setLong(4, stats.paymentCount());
                    statement.setLong(5, stats.amountMinor());
                })
                .withExecutionOptions(JdbcExecutionOptions.builder()
                        .withBatchSize(200)
                        .withBatchIntervalMs(1_000)
                        .withMaxRetries(3)
                        .build())
                .buildAtLeastOnce(new JdbcConnectionOptions.JdbcConnectionOptionsBuilder()
                        .withUrl(System.getenv("PAYGUARD_DB_URL"))
                        .withDriverName("org.postgresql.Driver")
                        .withUsername(System.getenv("PAYGUARD_DB_USER"))
                        .withPassword(System.getenv("PAYGUARD_DB_PASSWORD"))
                        .build());
    }

    private JdbcSinks() {
    }
}
