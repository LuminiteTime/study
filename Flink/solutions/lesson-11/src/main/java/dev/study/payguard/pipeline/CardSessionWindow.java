package dev.study.payguard.pipeline;

import dev.study.payguard.model.CardSession;
import dev.study.payguard.model.PaymentEvent;
import java.time.Duration;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.functions.windowing.ProcessWindowFunction;
import org.apache.flink.streaming.api.windowing.assigners.EventTimeSessionWindows;
import org.apache.flink.streaming.api.windowing.windows.TimeWindow;
import org.apache.flink.util.Collector;

/** Склеивает платежи по карте в сессии: пауза дольше {@link #SESSION_GAP} закрывает сессию. */
public final class CardSessionWindow {

    public static final Duration SESSION_GAP = Duration.ofSeconds(30);

    public static SingleOutputStreamOperator<CardSession> attach(DataStream<PaymentEvent> payments) {
        return payments
                .keyBy(PaymentEvent::cardId)
                .window(EventTimeSessionWindows.withGap(SESSION_GAP))
                .aggregate(new PaymentTotals(), new ToCardSession())
                .name("card-sessions")
                .uid("card-sessions");
    }

    private static final class ToCardSession
            extends ProcessWindowFunction<PaymentTotals.Accumulator, CardSession, String, TimeWindow> {

        @Override
        public void process(
                String cardId,
                Context context,
                Iterable<PaymentTotals.Accumulator> totals,
                Collector<CardSession> out) {
            PaymentTotals.Accumulator total = totals.iterator().next();
            out.collect(new CardSession(
                    cardId, context.window().getStart(), context.window().getEnd(), total.count(), total.amountMinor()));
        }
    }

    private CardSessionWindow() {
    }
}
