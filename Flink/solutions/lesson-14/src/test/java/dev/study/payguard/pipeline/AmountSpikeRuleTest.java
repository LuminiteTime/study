package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AmountSpikeRuleTest {

    private KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, FraudAlert> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forKeyedProcessFunction(
                new AmountSpikeRule(1_000), PaymentEvent::cardId, Types.STRING);
    }

    @Test
    void alertsWhenSumOverWindowExceedsLimit() throws Exception {
        harness.processElement(payment("p1", "c1", "m1", 600, 1_000), 1_000);
        assertThat(harness.extractOutputValues()).isEmpty();

        harness.processElement(payment("p2", "c1", "m1", 600, 300_000), 300_000);
        assertThat(harness.extractOutputValues()).singleElement()
                .satisfies(alert -> assertThat(alert.ruleId()).isEqualTo(AmountSpikeRule.RULE_ID));
    }

    @Test
    void spendingOutsideWindowDoesNotCount() throws Exception {
        harness.processElement(payment("p1", "c1", "m1", 600, 1_000), 1_000);
        harness.processElement(payment("p2", "c1", "m1", 600, 700_000), 700_000);
        assertThat(harness.extractOutputValues()).isEmpty();
    }
}
