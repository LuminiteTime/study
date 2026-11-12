package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.paymentOnCard;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RuleConfig;
import java.util.List;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.apache.flink.streaming.util.KeyedBroadcastOperatorTestHarness;

class DynamicRulesTest {

    private KeyedBroadcastOperatorTestHarness<String, PaymentEvent, RuleConfig, FraudAlert> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forKeyedBroadcastProcessFunction(
                new DynamicRules(new RuleConfig(2, List.of())),
                PaymentEvent::cardId,
                Types.STRING,
                DynamicRules.RULES);
    }

    private void pay(String id, long time) throws Exception {
        harness.processElement(paymentOnCard(id, "c1", time), time);
    }

    private List<String> alertIds() {
        return harness.extractOutputValues().stream().map(FraudAlert::alertId).toList();
    }

    @Test
    void usesDefaultsUntilFirstUpdateArrives() throws Exception {
        pay("p1", 1_000);
        pay("p2", 2_000);
        pay("p3", 3_000);
        assertThat(alertIds()).containsExactly("velocity:p3");
    }

    @Test
    void updatedLimitAppliesWithoutRestart() throws Exception {
        harness.processBroadcastElement(new RuleConfig(100, List.of()), 0);
        pay("p1", 1_000);
        pay("p2", 2_000);
        pay("p3", 3_000);
        assertThat(alertIds()).isEmpty();
    }

    @Test
    void blockedCountryAlertsOnFirstPayment() throws Exception {
        harness.processBroadcastElement(new RuleConfig(100, List.of("DE")), 0);
        pay("p1", 1_000);
        assertThat(alertIds()).containsExactly("blocked-country:p1");
    }
}
