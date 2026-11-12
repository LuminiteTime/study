package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static dev.study.payguard.testing.Payments.streamOf;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.ConfirmedPayment;
import dev.study.payguard.model.PaymentConfirmation;
import java.util.List;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class PaymentConfirmationJoinTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(2)
                    .build());

    @Test
    void joinsOnlyConfirmationsInsideInterval() throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(2);
        DataStream<PaymentConfirmation> confirmations = env
                .fromData(List.of(
                        new PaymentConfirmation("p1", "OK", 3_000),
                        new PaymentConfirmation("p2", "OK", 1_000_000)))
                .assignTimestampsAndWatermarks(WatermarkStrategy.<PaymentConfirmation>forMonotonousTimestamps()
                        .withTimestampAssigner((confirmation, ts) -> confirmation.eventTimeMs()));

        List<ConfirmedPayment> joined = PaymentConfirmationJoin.attach(
                        streamOf(env, List.of(
                                payment("p1", "c1", "m1", 100, 1_000),
                                payment("p2", "c1", "m1", 200, 2_000))),
                        confirmations)
                .executeAndCollect(10);

        assertThat(joined).containsExactly(new ConfirmedPayment("p1", "m1", 100, "OK", 2_000));
    }
}
