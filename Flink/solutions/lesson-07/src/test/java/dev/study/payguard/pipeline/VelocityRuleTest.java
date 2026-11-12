package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.paymentOnCard;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class VelocityRuleTest {

    private static final int MAX_PAYMENTS = 3;

    private KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, FraudAlert> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forKeyedProcessFunction(
                new VelocityRule(MAX_PAYMENTS), PaymentEvent::cardId, Types.STRING);
    }

    private void pay(String id, String card, long eventTime) throws Exception {
        harness.processElement(paymentOnCard(id, card, eventTime), eventTime);
    }

    @Test
    void alertsWhenLimitExceededWithinMinute() throws Exception {
        pay("p1", "c1", 1_000);
        pay("p2", "c1", 2_000);
        pay("p3", "c1", 3_000);
        assertThat(harness.extractOutputValues()).isEmpty();

        pay("p4", "c1", 4_000);
        assertThat(harness.extractOutputValues())
                .singleElement()
                .satisfies(alert -> assertThat(alert.alertId()).isEqualTo("velocity:p4"));
    }

    @Test
    void doesNotRepeatAlertWithinSameMinute() throws Exception {
        for (int i = 1; i <= 6; i++) {
            pay("p" + i, "c1", i * 1_000L);
        }
        assertThat(harness.extractOutputValues()).hasSize(1);
    }

    @Test
    void cardsAreCountedSeparately() throws Exception {
        pay("p1", "c1", 1_000);
        pay("p2", "c1", 2_000);
        pay("p3", "c2", 3_000);
        pay("p4", "c2", 4_000);
        assertThat(harness.extractOutputValues()).isEmpty();
    }

    @Test
    void oldPaymentsLeaveStateWhenWatermarkPasses() throws Exception {
        pay("p1", "c1", 1_000);
        pay("p2", "c1", 2_000);
        pay("p3", "c1", 3_000);
        assertThat(harness.numEventTimeTimers()).isEqualTo(1);

        harness.processWatermark(new Watermark(200_000));
        assertThat(harness.numEventTimeTimers()).isZero();

        pay("p4", "c1", 201_000);
        assertThat(harness.extractOutputValues()).isEmpty();
    }
}
