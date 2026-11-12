package dev.study.payguard.model;

/** Платёж по карте: неизменяемый факт, который случился в момент {@code eventTimeMs}. */
public record PaymentEvent(
        String paymentId,
        String cardId,
        String merchantId,
        long amountMinor,
        String currency,
        String country,
        long eventTimeMs) {
}
