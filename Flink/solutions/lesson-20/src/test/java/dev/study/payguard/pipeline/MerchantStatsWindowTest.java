package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static dev.study.payguard.testing.Payments.streamOf;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.PaymentEvent;
import java.util.List;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class MerchantStatsWindowTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(2)
                    .build());

    @Test
    void sumsPaymentsPerMerchantPerMinute() throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(2);
        List<PaymentEvent> payments = List.of(
                payment("p1", "c1", "m1", 100, 1_000),
                payment("p2", "c2", "m1", 200, 59_000),
                payment("p3", "c3", "m2", 300, 10_000),
                payment("p4", "c4", "m1", 400, 61_000));

        List<MerchantStats> stats = MerchantStatsWindow.attach(streamOf(env, payments)).executeAndCollect(10);

        assertThat(stats).containsExactlyInAnyOrder(
                new MerchantStats("m1", 0, 60_000, 2, 300),
                new MerchantStats("m2", 0, 60_000, 1, 300),
                new MerchantStats("m1", 60_000, 120_000, 1, 400));
    }
}
