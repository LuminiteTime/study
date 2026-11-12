package dev.study.payguard.pipeline;

import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

/**
 * Двухфазная агрегация для горячего ключа. Первая фаза считает по продавцу с солью и разносит нагрузку по подзадачам,
 * вторая складывает частичные итоги по настоящему продавцу.
 */
public final class SaltedMerchantStats {

    /** Опоздания отключены намеренно: повторное срабатывание первой фазы удвоило бы частичный итог во второй. */
    public static SingleOutputStreamOperator<MerchantStats> firstPhase(DataStream<PaymentEvent> payments, int salts) {
        return payments
                .keyBy(payment -> saltedKey(payment, salts))
                .window(TumblingEventTimeWindows.of(MerchantStatsWindow.WINDOW_SIZE))
                .sideOutputLateData(MerchantStatsWindow.TOO_LATE)
                .aggregate(new PaymentTotals(), new PartialStats())
                .name("merchant-stats-salted")
                .uid("merchant-stats-salted");
    }

    public static SingleOutputStreamOperator<MerchantStats> secondPhase(DataStream<MerchantStats> partial) {
        return partial
                .keyBy(MerchantStats::merchantId)
                .window(TumblingEventTimeWindows.of(MerchantStatsWindow.WINDOW_SIZE))
                .reduce(SaltedMerchantStats::add)
                .name("merchant-stats-merged")
                .uid("merchant-stats-merged");
    }

    private static String saltedKey(PaymentEvent payment, int salts) {
        return payment.merchantId() + "#" + Math.floorMod(payment.paymentId().hashCode(), salts);
    }

    private static String merchantOf(String saltedKey) {
        return saltedKey.substring(0, saltedKey.indexOf('#'));
    }

    private static MerchantStats add(MerchantStats left, MerchantStats right) {
        return new MerchantStats(
                left.merchantId(),
                left.windowStartMs(),
                left.windowEndMs(),
                left.paymentCount() + right.paymentCount(),
                left.amountMinor() + right.amountMinor());
    }

    private static final class PartialStats
            extends ProcessWindowFunction<PaymentTotals.Accumulator, MerchantStats, String, TimeWindow> {

        @Override
        public void process(
                String saltedKey,
                Context context,
                Iterable<PaymentTotals.Accumulator> totals,
                Collector<MerchantStats> out) {
            PaymentTotals.Accumulator total = totals.iterator().next();
            TimeWindow window = context.window();
            out.collect(new MerchantStats(
                    merchantOf(saltedKey), window.getStart(), window.getEnd(), total.count(), total.amountMinor()));
        }
    }

    private SaltedMerchantStats() {
    }
}
