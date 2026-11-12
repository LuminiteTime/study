package dev.study.payguard.model;

/** Результат разбора одной записи Kafka: заполнено ровно одно поле. */
public record ParsedRecord(PaymentEvent payment, RejectedRecord rejected) {

    public static ParsedRecord accepted(PaymentEvent payment) {
        return new ParsedRecord(payment, null);
    }

    public static ParsedRecord rejected(RejectedRecord rejected) {
        return new ParsedRecord(null, rejected);
    }

    public boolean isAccepted() {
        return payment != null;
    }
}
