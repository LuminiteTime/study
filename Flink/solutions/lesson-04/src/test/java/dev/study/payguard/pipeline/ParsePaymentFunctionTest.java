package dev.study.payguard.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import java.util.List;
import org.apache.flink.streaming.runtime.streamrecord.StreamRecord;
import org.apache.flink.streaming.util.OneInputStreamOperatorTestHarness;
import org.apache.flink.streaming.util.ProcessFunctionTestHarnesses;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ParsePaymentFunctionTest {

    private static final String VALID = """
            {"paymentId":"p1","cardId":"c1","merchantId":"m1","amountMinor":1500,
             "currency":"EUR","country":"DE","eventTimeMs":1000}""";

    private OneInputStreamOperatorTestHarness<String, PaymentEvent> harness;

    @BeforeEach
    void setUp() throws Exception {
        harness = ProcessFunctionTestHarnesses.forProcessFunction(new ParsePaymentFunction());
    }

    @Test
    void validJsonGoesToMainOutput() throws Exception {
        harness.processElement(VALID, 0L);

        List<PaymentEvent> payments = harness.extractOutputValues();
        assertThat(payments).containsExactly(new PaymentEvent("p1", "c1", "m1", 1500, "EUR", "DE", 1000));
        assertThat(harness.getSideOutput(ParsePaymentFunction.REJECTED)).isNull();
    }

    @Test
    void brokenJsonGoesToSideOutputWithReason() throws Exception {
        harness.processElement("{broken", 0L);

        assertThat(harness.extractOutputValues()).isEmpty();
        StreamRecord<RejectedRecord> rejected = harness.getSideOutput(ParsePaymentFunction.REJECTED).poll();
        assertThat(rejected.getValue().raw()).isEqualTo("{broken");
        assertThat(rejected.getValue().reason()).isEqualTo("bad-json");
    }
}
