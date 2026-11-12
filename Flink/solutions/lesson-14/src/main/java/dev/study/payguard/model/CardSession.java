package dev.study.payguard.model;

/** Серия платежей по карте, в которой паузы короче заданного интервала. */
public record CardSession(String cardId, long sessionStartMs, long sessionEndMs, long paymentCount, long amountMinor) {
}
