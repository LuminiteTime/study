package dev.study.payguard.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.streaming.api.watermark.Watermark;
import org.apache.flink.streaming.util.OneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.Test;

class LatenessProbeTest {

    private static PaymentEvent paymentAt(long eventTimeMs) {
        return new PaymentEvent("p", "c", "m", 100, "EUR", "DE", eventTimeMs);
    }

    @Test
    void lateEventsAreStillForwardedDownstream() throws Exception {
        OneInputStreamOperatorTestHarness<PaymentEvent, PaymentEvent> harness =
                ProcessFunctionTestHarnesses.forProcessFunction(new LatenessProbe());

        harness.processElement(paymentAt(5_000), 5_000);
        harness.processWatermark(new Watermark(10_000));
        harness.processElement(paymentAt(4_000), 4_000);

        assertThat(harness.extractOutputValues()).containsExactly(paymentAt(5_000), paymentAt(4_000));
    }
}
