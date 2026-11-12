package dev.study.payguard.model;

/** Сигнал о подозрительной активности. Идентификатор детерминирован: повторная обработка даёт тот же алерт. */
public record FraudAlert(
        String alertId,
        String ruleId,
        String cardId,
        String merchantId,
        String paymentId,
        String detail,
        long eventTimeMs) {

    public static FraudAlert of(String ruleId, PaymentEvent trigger, String detail) {
        return new FraudAlert(
                ruleId + ":" + trigger.paymentId(),
                ruleId,
                trigger.cardId(),
                trigger.merchantId(),
                trigger.paymentId(),
                detail,
                trigger.eventTimeMs());
    }
}
