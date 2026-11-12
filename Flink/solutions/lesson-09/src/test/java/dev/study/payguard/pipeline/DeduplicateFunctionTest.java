package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.paymentOnCard;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class DeduplicateFunctionTest {

    private KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, PaymentEvent> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forKeyedProcessFunction(
                new DeduplicateFunction(), PaymentEvent::paymentId, Types.STRING);
    }

    @Test
    void repeatedPaymentIdPassesOnlyOnce() throws Exception {
        harness.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);
        harness.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);
        harness.processElement(paymentOnCard("p2", "c1", 2_000), 2_000);

        assertThat(harness.extractOutputValues()).extracting(PaymentEvent::paymentId).containsExactly("p1", "p2");
    }

    @Test
    void paymentIsForgottenAfterTtl() throws Exception {
        harness.setStateTtlProcessingTime(0);
        harness.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);

        harness.setStateTtlProcessingTime(DeduplicateFunction.REMEMBER_FOR.toMillis() + 1);
        harness.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);

        assertThat(harness.extractOutputValues()).hasSize(2);
    }
}
