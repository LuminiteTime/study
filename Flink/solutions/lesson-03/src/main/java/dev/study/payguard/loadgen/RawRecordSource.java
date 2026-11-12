package dev.study.payguard.loadgen;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.study.payguard.model.PaymentEvent;
import java.util.Random;

/** Превращает платежи в строки JSON и подмешивает грязь: дубликаты и битые записи. */
final class RawRecordSource {

    static final String BAD_RECORD = "{\"paymentId\": broken";

    private final ObjectMapper mapper = new ObjectMapper();
    private final PaymentFactory factory;
    private final Random random;
    private final double duplicateShare;
    private final double badShare;
    private String previousRecord;

    RawRecordSource(PaymentFactory factory, Random random, double duplicateShare, double badShare) {
        this.factory = factory;
        this.random = random;
        this.duplicateShare = duplicateShare;
        this.badShare = badShare;
    }

    String next(long nowMs) {
        if (random.nextDouble() < badShare) {
            return BAD_RECORD;
        }
        if (previousRecord != null && random.nextDouble() < duplicateShare) {
            return previousRecord;
        }
        previousRecord = toJson(factory.next(nowMs));
        return previousRecord;
    }

    private String toJson(PaymentEvent event) {
        try {
            return mapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Не удалось сериализовать платёж", e);
        }
    }
}
