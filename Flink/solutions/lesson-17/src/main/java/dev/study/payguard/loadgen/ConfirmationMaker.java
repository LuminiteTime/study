package dev.study.payguard.loadgen;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.study.payguard.model.PaymentConfirmation;
import java.util.Optional;
import java.util.Random;

/** По записи платежа создаёт подтверждение от банка. Часть платежей подтверждения не получает. */
final class ConfirmationMaker {

    private static final int MAX_DELAY_MS = 3_000;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Random random;
    private final double confirmedShare;

    ConfirmationMaker(Random random, double confirmedShare) {
        this.random = random;
        this.confirmedShare = confirmedShare;
    }

    Optional<String> confirmationFor(String rawPayment) {
        if (random.nextDouble() >= confirmedShare) {
            return Optional.empty();
        }
        try {
            JsonNode payment = mapper.readTree(rawPayment);
            long eventTime = payment.get("eventTimeMs").asLong() + random.nextInt(MAX_DELAY_MS);
            return Optional.of(mapper.writeValueAsString(
                    new PaymentConfirmation(payment.get("paymentId").asText(), "APPROVED", eventTime)));
        } catch (JsonProcessingException e) {
            return Optional.empty();
        }
    }
}
