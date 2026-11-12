package dev.study.payguard.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import dev.study.payguard.model.PaymentEvent;
import org.junit.jupiter.api.Test;

class PaymentValidatorTest {

    private static PaymentEvent payment(String id, long amount, String currency, long time) {
        return new PaymentEvent(id, "c1", "m1", amount, currency, "DE", time);
    }

    @Test
    void acceptsCorrectPayment() {
        assertThat(PaymentValidator.rejectionReason(payment("p1", 100, "EUR", 1))).isEmpty();
    }

    @Test
    void rejectsMissingId() {
        assertThat(PaymentValidator.rejectionReason(payment(" ", 100, "EUR", 1))).contains("missing-id");
    }

    @Test
    void rejectsNonPositiveAmount() {
        assertThat(PaymentValidator.rejectionReason(payment("p1", 0, "EUR", 1))).contains("non-positive-amount");
    }

    @Test
    void rejectsBadCurrency() {
        assertThat(PaymentValidator.rejectionReason(payment("p1", 100, "euro", 1))).contains("bad-currency");
    }

    @Test
    void rejectsMissingEventTime() {
        assertThat(PaymentValidator.rejectionReason(payment("p1", 100, "EUR", 0))).contains("missing-event-time");
    }
}
