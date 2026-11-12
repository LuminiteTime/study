package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.CardProfile;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.Test;

class CardProfileFunctionTest {

    @Test
    void accumulatesPerCard() throws Exception {
        KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, CardProfile> harness =
                ProcessFunctionTestHarnesses.forKeyedProcessFunction(
                        new CardProfileFunction(), PaymentEvent::cardId, Types.STRING);

        harness.processElement(payment("p1", "c1", "m1", 100, 1_000), 1_000);
        harness.processElement(payment("p2", "c1", "m1", 200, 2_000), 2_000);

        assertThat(harness.extractOutputValues()).last().isEqualTo(new CardProfile(2, 300, "DE"));
    }
}
