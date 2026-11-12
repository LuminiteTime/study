package dev.study.payguard.pipeline;

import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.functions.AggregateFunction;

/** Считает количество и сумму платежей. Хранит только два числа, сами события не копятся. */
public class PaymentTotals implements AggregateFunction<PaymentEvent, PaymentTotals.Accumulator, PaymentTotals.Accumulator> {

    /** Промежуточный итог окна. */
    public record Accumulator(long count, long amountMinor) {
    }

    @Override
    public Accumulator createAccumulator() {
        return new Accumulator(0, 0);
    }

    @Override
    public Accumulator add(PaymentEvent payment, Accumulator accumulator) {
        return new Accumulator(accumulator.count() + 1, accumulator.amountMinor() + payment.amountMinor());
    }

    @Override
    public Accumulator getResult(Accumulator accumulator) {
        return accumulator;
    }

    @Override
    public Accumulator merge(Accumulator left, Accumulator right) {
        return new Accumulator(left.count() + right.count(), left.amountMinor() + right.amountMinor());
    }
}
