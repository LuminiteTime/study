package dev.study.payguard.model;

/** Итоги продавца за одно окно времени. */
public record MerchantStats(String merchantId, long windowStartMs, long windowEndMs, long paymentCount, long amountMinor) {
}
