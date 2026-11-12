package dev.study.payguard.model;

/** Подтверждение платежа от банка-эмитента, приходит отдельным потоком. */
public record PaymentConfirmation(String paymentId, String status, long eventTimeMs) {
}
