package dev.study.payguard.loadgen;

import dev.study.payguard.model.PaymentEvent;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;

/** Создаёт правдоподобные платежи. Random передаётся снаружи, чтобы тесты были повторяемыми. */
final class PaymentFactory {

    private static final int CARD_COUNT = 5_000;
    private static final int MERCHANT_COUNT = 50;
    private static final String HOT_MERCHANT = "m-0000";
    private static final double HOT_MERCHANT_SHARE = 0.3;
    private static final long MAX_LATENESS_MS = 30_000;
    private static final List<String> COUNTRIES = List.of("DE", "FR", "PL", "ES", "NL");

    private final Random random;
    private final double lateShare;

    PaymentFactory(Random random, double lateShare) {
        this.random = random;
        this.lateShare = lateShare;
    }

    PaymentEvent next(long nowMs) {
        return paymentOn(randomCard(), nextMerchant(), 100 + random.nextInt(50_000), nextEventTime(nowMs));
    }

    /** Серия платежей по одной карте подряд: так выглядит атака, которую ловит правило частоты. */
    List<PaymentEvent> burst(long nowMs, int size) {
        String card = randomCard();
        List<PaymentEvent> payments = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            payments.add(paymentOn(card, nextMerchant(), 100 + random.nextInt(5_000), nowMs + i));
        }
        return payments;
    }

    private PaymentEvent paymentOn(String card, String merchant, long amountMinor, long eventTimeMs) {
        return new PaymentEvent(
                new UUID(random.nextLong(), random.nextLong()).toString(),
                card,
                merchant,
                amountMinor,
                "EUR",
                COUNTRIES.get(random.nextInt(COUNTRIES.size())),
                eventTimeMs);
    }

    private String randomCard() {
        return "c-%04d".formatted(random.nextInt(CARD_COUNT));
    }

    private String nextMerchant() {
        return random.nextDouble() < HOT_MERCHANT_SHARE
                ? HOT_MERCHANT
                : "m-%04d".formatted(1 + random.nextInt(MERCHANT_COUNT - 1));
    }

    private long nextEventTime(long nowMs) {
        return random.nextDouble() < lateShare
                ? nowMs - (long) (random.nextDouble() * MAX_LATENESS_MS)
                : nowMs;
    }
}
