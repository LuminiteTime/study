package dev.study.payguard.model;

/** Платёж вместе с его подтверждением и задержкой между ними. */
public record ConfirmedPayment(String paymentId, String merchantId, long amountMinor, String status, long confirmationDelayMs) {
}
