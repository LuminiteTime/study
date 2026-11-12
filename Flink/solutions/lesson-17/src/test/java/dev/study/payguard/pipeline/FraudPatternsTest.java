package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static dev.study.payguard.testing.Payments.streamOf;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import java.util.List;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.datastream.KeyedStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;

class FraudPatternsTest {

    @RegisterExtension
    static final MiniClusterExtension CLUSTER = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder()
                    .setNumberTaskManagers(1)
                    .setNumberSlotsPerTaskManager(2)
                    .build());

    private static KeyedStream<PaymentEvent, String> byCard(List<PaymentEvent> payments) {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setParallelism(2);
        return streamOf(env, payments).keyBy(PaymentEvent::cardId);
    }

    private static PaymentEvent inCountry(String id, String country, long time) {
        return new PaymentEvent(id, "c1", "m1", 1_000, "EUR", country, time);
    }

    @Test
    void cardTestingFiresOnSmallPaymentsThenLargeOne() throws Exception {
        List<PaymentEvent> payments = List.of(
                payment("p1", "c1", "m1", 100, 1_000),
                payment("p2", "c1", "m1", 100, 2_000),
                payment("p3", "c1", "m1", 100, 3_000),
                payment("p4", "c1", "m1", 90_000, 4_000));

        List<FraudAlert> alerts = FraudPatterns.cardTestingAlerts(byCard(payments)).executeAndCollect(10);

        assertThat(alerts).extracting(FraudAlert::alertId).containsExactly("card-testing:p4");
    }

    @Test
    void cardTestingIgnoresBrokenSequence() throws Exception {
        List<PaymentEvent> payments = List.of(
                payment("p1", "c1", "m1", 100, 1_000),
                payment("p2", "c1", "m1", 100, 2_000),
                payment("p3", "c1", "m1", 5_000, 3_000),
                payment("p4", "c1", "m1", 100, 4_000),
                payment("p5", "c1", "m1", 90_000, 5_000));

        assertThat(FraudPatterns.cardTestingAlerts(byCard(payments)).executeAndCollect(10)).isEmpty();
    }

    @Test
    void cardTestingRespectsTimeLimit() throws Exception {
        long tooLate = 1_000 + 6 * 60_000;
        List<PaymentEvent> payments = List.of(
                payment("p1", "c1", "m1", 100, 1_000),
                payment("p2", "c1", "m1", 100, 2_000),
                payment("p3", "c1", "m1", 100, 3_000),
                payment("p4", "c1", "m1", 90_000, tooLate));

        assertThat(FraudPatterns.cardTestingAlerts(byCard(payments)).executeAndCollect(10)).isEmpty();
    }

    @Test
    void impossibleTravelFiresOnCountryChange() throws Exception {
        List<PaymentEvent> payments = List.of(
                inCountry("p1", "DE", 1_000),
                inCountry("p2", "DE", 2_000),
                inCountry("p3", "ES", 3_000));

        List<FraudAlert> alerts = FraudPatterns.impossibleTravelAlerts(byCard(payments)).executeAndCollect(10);

        assertThat(alerts).extracting(FraudAlert::alertId).containsExactly("impossible-travel:p3");
    }

    @Test
    void travelIsPossibleWhenEnoughTimePassed() throws Exception {
        List<PaymentEvent> payments = List.of(
                inCountry("p1", "DE", 1_000),
                inCountry("p2", "ES", 1_000 + 11 * 60_000));

        assertThat(FraudPatterns.impossibleTravelAlerts(byCard(payments)).executeAndCollect(10)).isEmpty();
    }
}
