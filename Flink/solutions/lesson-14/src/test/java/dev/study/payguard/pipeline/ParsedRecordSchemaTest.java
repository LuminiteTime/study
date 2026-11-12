package dev.study.payguard.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentEvent;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ParsedRecordSchemaTest {

    private final ParsedRecordSchema schema = new ParsedRecordSchema();

    @BeforeEach
    void setUp() {
        schema.open(null);
    }

    private ParsedRecord parse(String raw) {
        return schema.deserialize(raw.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void validRecordIsAccepted() {
        ParsedRecord record = parse("""
                {"paymentId":"p1","cardId":"c1","merchantId":"m1","amountMinor":1500,
                 "currency":"EUR","country":"DE","eventTimeMs":1000}""");
        assertThat(record.payment()).isEqualTo(new PaymentEvent("p1", "c1", "m1", 1500, "EUR", "DE", 1000));
    }

    @Test
    void brokenJsonIsRejectedWithReason() {
        ParsedRecord record = parse("{broken");
        assertThat(record.isAccepted()).isFalse();
        assertThat(record.rejected().reason()).isEqualTo("bad-json");
    }

    @Test
    void invalidPaymentIsRejectedWithValidatorReason() {
        ParsedRecord record = parse("""
                {"paymentId":"p1","cardId":"c1","merchantId":"m1","amountMinor":-5,
                 "currency":"EUR","country":"DE","eventTimeMs":1000}""");
        assertThat(record.rejected().reason()).isEqualTo("non-positive-amount");
    }
}
