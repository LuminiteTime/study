package dev.study.payguard.loadgen;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.study.payguard.model.PaymentEvent;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Random;

/** Превращает платежи в строки JSON и подмешивает грязь и атаки: дубликаты, битые записи, серии по карте. */
final class RawRecordSource {

    static final String BAD_RECORD = "{\"paymentId\": broken";
    static final int BURST_SIZE = 25;

    private final ObjectMapper mapper = new ObjectMapper();
    private final Deque<PaymentEvent> pendingBurst = new ArrayDeque<>();
    private final PaymentFactory factory;
    private final Random random;
    private final double duplicateShare;
    private final double badShare;
    private final double burstShare;
    private final double cardTestingShare;
    private final double travelShare;
    private String previousRecord;

    RawRecordSource(PaymentFactory factory, Random random, GeneratorConfig config) {
        this.factory = factory;
        this.random = random;
        this.duplicateShare = config.duplicateShare();
        this.badShare = config.badShare();
        this.burstShare = config.burstShare();
        this.cardTestingShare = config.cardTestingShare();
        this.travelShare = config.travelShare();
    }

    String next(long nowMs) {
        if (!pendingBurst.isEmpty()) {
            return remember(pendingBurst.poll());
        }
        if (random.nextDouble() < burstShare) {
            pendingBurst.addAll(factory.burst(nowMs, BURST_SIZE));
            return remember(pendingBurst.poll());
        }
        if (random.nextDouble() < cardTestingShare) {
            pendingBurst.addAll(factory.cardTestingAttack(nowMs));
            return remember(pendingBurst.poll());
        }
        if (random.nextDouble() < travelShare) {
            pendingBurst.addAll(factory.impossibleTravelAttack(nowMs));
            return remember(pendingBurst.poll());
        }
        if (random.nextDouble() < badShare) {
            return BAD_RECORD;
        }
        if (previousRecord != null && random.nextDouble() < duplicateShare) {
            return previousRecord;
        }
        return remember(factory.next(nowMs));
    }

    private String remember(PaymentEvent payment) {
        previousRecord = toJson(payment);
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
