package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.paymentOnCard;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentConfirmation;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.util.KeyedTwoInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class UnconfirmedPaymentFunctionTest {

    private static final long TIMEOUT = 300_000;

    private KeyedTwoInputStreamOperatorTestHarness<String, PaymentEvent, PaymentConfirmation, FraudAlert> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forKeyedCoProcessFunction(
                new UnconfirmedPaymentFunction(TIMEOUT),
                PaymentEvent::paymentId,
                PaymentConfirmation::paymentId,
                Types.STRING);
    }

    private void advanceBothWatermarks(long time) throws Exception {
        harness.processWatermark1(new Watermark(time));
        harness.processWatermark2(new Watermark(time));
    }

    @Test
    void alertsWhenConfirmationNeverArrives() throws Exception {
        harness.processElement1(paymentOnCard("p1", "c1", 1_000), 1_000);
        advanceBothWatermarks(1_000 + TIMEOUT);
        assertThat(harness.extractOutputValues()).singleElement()
                .satisfies(alert -> assertThat(alert.alertId()).isEqualTo("unconfirmed:p1"));
    }

    @Test
    void confirmationInTimeCancelsAlert() throws Exception {
        harness.processElement1(paymentOnCard("p1", "c1", 1_000), 1_000);
        harness.processElement2(new PaymentConfirmation("p1", "OK", 5_000), 5_000);
        advanceBothWatermarks(1_000 + TIMEOUT);
        assertThat(harness.extractOutputValues()).isEmpty();
        assertThat(harness.numEventTimeTimers()).isZero();
    }

    @Test
    void confirmationArrivingBeforePaymentAlsoCounts() throws Exception {
        harness.processElement2(new PaymentConfirmation("p1", "OK", 900), 900);
        harness.processElement1(paymentOnCard("p1", "c1", 1_000), 1_000);
        advanceBothWatermarks(10 * TIMEOUT);
        assertThat(harness.extractOutputValues()).isEmpty();
    }

    @Test
    void timerDoesNotFireUntilSlowerInputCatchesUp() throws Exception {
        harness.processElement1(paymentOnCard("p1", "c1", 1_000), 1_000);
        harness.processWatermark1(new Watermark(1_000 + TIMEOUT));
        assertThat(harness.extractOutputValues()).isEmpty();
    }
}
