package dev.study.payguard.pipeline;

import static dev.study.payguard.testing.Payments.paymentOnCard;
import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.runtime.checkpoint.OperatorSubtaskState;
import org.apache.flink.streaming.api.operators.KeyedProcessOperator;
import org.apache.flink.streaming.util.KeyedOneInputStreamOperatorTestHarness;
import org.junit.jupiter.api.Test;

/** Ответ к заданию урока 16: повтор платежа после рестарта всё ещё отсекается. */
class DeduplicateRestoreTest {

    @Test
    void duplicateAfterRestartIsDropped() throws Exception {
        OperatorSubtaskState snapshot;
        try (var before = newHarness()) {
            before.open();
            before.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);
            snapshot = before.snapshot(1L, 1_000);
        }

        try (var after = newHarness()) {
            after.initializeState(snapshot);
            after.open();
            after.processElement(paymentOnCard("p1", "c1", 1_000), 1_000);
            after.processElement(paymentOnCard("p2", "c1", 2_000), 2_000);

            assertThat(after.extractOutputValues()).extracting(PaymentEvent::paymentId).containsExactly("p2");
        }
    }

    private static KeyedOneInputStreamOperatorTestHarness<String, PaymentEvent, PaymentEvent> newHarness() throws Exception {
        return new KeyedOneInputStreamOperatorTestHarness<>(
                new KeyedProcessOperator<>(new DeduplicateFunction()), PaymentEvent::paymentId, Types.STRING);
    }
}
