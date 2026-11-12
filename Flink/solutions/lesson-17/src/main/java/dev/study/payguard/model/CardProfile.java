package dev.study.payguard.model;

/** Накопленный профиль карты. Лежит в состоянии, поэтому менять его можно только по правилам эволюции схемы. */
public record CardProfile(long paymentCount, long totalAmountMinor, String lastCountry) {

    public static final CardProfile EMPTY = new CardProfile(0, 0, null);

    public CardProfile plus(PaymentEvent payment) {
        return new CardProfile(paymentCount + 1, totalAmountMinor + payment.amountMinor(), payment.country());
    }
}
