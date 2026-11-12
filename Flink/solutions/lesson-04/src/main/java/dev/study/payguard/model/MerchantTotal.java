package dev.study.payguard.model;

/** Накопительный итог по продавцу с момента запуска задания. */
public record MerchantTotal(String merchantId, long paymentCount, long amountMinor) {

    public static MerchantTotal of(PaymentEvent payment) {
        return new MerchantTotal(payment.merchantId(), 1, payment.amountMinor());
    }

    public MerchantTotal plus(MerchantTotal other) {
        return new MerchantTotal(merchantId, paymentCount + other.paymentCount, amountMinor + other.amountMinor);
    }
}
