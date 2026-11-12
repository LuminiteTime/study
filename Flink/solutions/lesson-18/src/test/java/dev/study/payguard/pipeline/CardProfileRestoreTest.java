package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.payment;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.CardProfile;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.runtime.checkpoint.OperatorSubtaskState;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.junit.jupiter.api.Test;

/** Снимает состояние в одном операторе и восстанавливает в другом, как при перезапуске задания. */
class CardProfileRestoreTest {

    @Test
    void profileSurvivesRestart() throws Exception {
        OperatorSubtaskState snapshot;
        try (var before = newHarness()) {
            before.open();
            before.processElement(payment("p1", "c1", "m1", 100, 1_000), 1_000);
            before.processElement(payment("p2", "c1", "m1", 200, 2_000), 2_000);
            snapshot = before.snapshot(1L, 2_000);
        }

        try (var after = newHarness()) {
            after.initializeState(snapshot);
            after.open();
            after.processElement(payment("p3", "c1", "m1", 400, 3_000), 3_000);

            assertThat(after.extractOutputValues()).containsExactly(new CardProfile(3, 700, "DE"));
        }
    }

    private static KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, CardProfile> newHarness() throws Exception {
        return new KeyedOneInputStreamOperatorTestHarness<>(
                new KeyedProcessOperator<>(new CardProfileFunction()), PaymentEvent::cardId, Types.STRING);
    }
}
