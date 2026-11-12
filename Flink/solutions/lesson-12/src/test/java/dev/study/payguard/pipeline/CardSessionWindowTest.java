package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static dev.study.payguard.testing.Payments.streamOf;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.CardSession;
import dev.study.payguard.model.PaymentEvent;
import java.util.List;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class CardSessionWindowTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(2)
                    .build());

    @Test
    void pauseLongerThanGapStartsNewSession() throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(1);
        List<PaymentEvent> payments = List.of(
                payment("p1", "c1", "m1", 100, 1_000),
                payment("p2", "c1", "m1", 200, 20_000),
                payment("p3", "c1", "m1", 400, 100_000));

        List<CardSession> sessions = CardSessionWindow.attach(streamOf(env, payments)).executeAndCollect(10);

        assertThat(sessions).containsExactlyInAnyOrder(
                new CardSession("c1", 1_000, 50_000, 2, 300),
                new CardSession("c1", 100_000, 130_000, 1, 400));
    }
}
