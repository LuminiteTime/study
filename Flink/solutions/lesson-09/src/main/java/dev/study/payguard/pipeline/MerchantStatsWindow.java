package dev.study.payguard.pipeline;

import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.PaymentEvent;
import java.time.Duration;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.TumblingEventTimeWindows;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

/** Минутные итоги по продавцам с допуском опозданий. */
public final class MerchantStatsWindow {

    public static final Duration WINDOW_SIZE = Duration.ofMinutes(1);
    public static final Duration ALLOWED_LATENESS = Duration.ofMinutes(1);
    public static final OutputTag<PaymentEvent> TOO_LATE = new OutputTag<>("too-late") {
    };

    public static SingleOutputStreamOperator<MerchantStats> attach(DataStream<PaymentEvent> payments) {
        return payments
                .keyBy(PaymentEvent::merchantId)
                .window(TumblingEventTimeWindows.of(WINDOW_SIZE))
                .allowedLateness(ALLOWED_LATENESS)
                .sideOutputLateData(TOO_LATE)
                .aggregate(new PaymentTotals(), new AddWindowBounds())
                .name("merchant-stats-1m")
                .uid("merchant-stats-1m");
    }

    private static final class AddWindowBounds
            extends ProcessWindowFunction<PaymentTotals.Accumulator, MerchantStats, String, TimeWindow> {

        @Override
        public void process(
                String merchantId,
                Context context,
                Iterable<PaymentTotals.Accumulator> totals,
                Collector<MerchantStats> out) {
            PaymentTotals.Accumulator total = totals.iterator().next();
            TimeWindow window = context.window();
            out.collect(new MerchantStats(merchantId, window.getStart(), window.getEnd(), total.count(), total.amountMinor()));
        }
    }

    private MerchantStatsWindow() {
    }
}
