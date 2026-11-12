package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static dev.study.payguard.testing.Payments.streamOf;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.PaymentEvent;
import java.util.List;
import java.util.stream.IntStream;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class SaltedMerchantStatsTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(4)
                    .build());

    @Test
    void saltingDoesNotChangeTotals() throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(4);
        List<PaymentEvent> hotPayments = IntStream.range(0, 100)
                .mapToObj(i -> payment("p" + i, "c" + i, "hot", 10, 1_000 + i))
                .toList();

        List<MerchantStats> stats = SaltedMerchantStats
                .secondPhase(SaltedMerchantStats.firstPhase(streamOf(env, hotPayments), 8))
                .executeAndCollect(10);

        assertThat(stats).containsExactly(new MerchantStats("hot", 0, 60_000, 100, 1_000));
    }
}
