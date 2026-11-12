package dev.study.payguard.pipeline;

import dev.study.payguard.model.PaymentEvent;
import java.util.Optional;

/** Бизнес-проверки платежа. Возвращает код причины отказа, если платёж принимать нельзя. */
final class PaymentValidator {

    private static final String THREE_LETTERS = "[A-Z]{3}";

    static Optional<String> rejectionReason(PaymentEvent payment) {
        if (isBlank(payment.paymentId()) || isBlank(payment.cardId()) || isBlank(payment.merchantId())) {
            return Optional.of("missing-id");
        }
        if (payment.amountMinor() <= 0) {
            return Optional.of("non-positive-amount");
        }
        if (payment.currency() == null || !payment.currency().matches(THREE_LETTERS)) {
            return Optional.of("bad-currency");
        }
        if (payment.eventTimeMs() <= 0) {
            return Optional.of("missing-event-time");
        }
        return Optional.empty();
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private PaymentValidator() {
    }
}
