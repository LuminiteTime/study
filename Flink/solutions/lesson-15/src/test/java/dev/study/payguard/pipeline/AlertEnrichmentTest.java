package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.datastream.AsyncDataStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.apache.flink.util.function.SerializableSupplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class AlertEnrichmentTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(1)
                    .build());

    private static final class FixedRisk implements MerchantDirectory {
        @Override
        public Optional<String> riskLevel(String merchantId) {
            return merchantId.equals("m1") ? Optional.of("HIGH") : Optional.empty();
        }

        @Override
        public void close() {
        }
    }

    private static final class BrokenDirectory implements MerchantDirectory {
        @Override
        public Optional<String> riskLevel(String merchantId) throws Exception {
            throw new java.sql.SQLException("база недоступна");
        }

        @Override
        public void close() {
        }
    }

    private static final class HangingDirectory implements MerchantDirectory {
        @Override
        public Optional<String> riskLevel(String merchantId) throws InterruptedException {
            TimeUnit.MINUTES.sleep(1);
            return Optional.of("HIGH");
        }

        @Override
        public void close() {
        }
    }

    private static List<String> enrich(SerializableSupplier<MerchantDirectory> directory, Duration timeout) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(1);
        DataStream<FraudAlert> alerts = env.fromData(List.of(
                FraudAlert.of("r", payment("p1", "c1", "m1", 100, 1_000), "d"),
                FraudAlert.of("r", payment("p2", "c1", "m2", 100, 2_000), "d")));
        return AsyncDataStream
                .unorderedWait(alerts, new AlertEnrichment(directory), timeout.toMillis(), TimeUnit.MILLISECONDS, 10)
                .map(alert -> alert.merchantId() + "=" + alert.merchantRisk())
                .executeAndCollect(10);
    }

    @Test
    void addsRiskFromDirectory() throws Exception {
        assertThat(enrich(FixedRisk::new, Duration.ofSeconds(10))).containsExactlyInAnyOrder("m1=HIGH", "m2=UNKNOWN");
    }

    @Test
    void directoryFailureDoesNotFailJob() throws Exception {
        assertThat(enrich(BrokenDirectory::new, Duration.ofSeconds(10))).containsExactlyInAnyOrder("m1=UNKNOWN", "m2=UNKNOWN");
    }

    @Test
    void slowDirectoryEndsWithTimeoutValue() throws Exception {
        assertThat(enrich(HangingDirectory::new, Duration.ofMillis(200))).containsExactlyInAnyOrder("m1=UNKNOWN", "m2=UNKNOWN");
    }
}
