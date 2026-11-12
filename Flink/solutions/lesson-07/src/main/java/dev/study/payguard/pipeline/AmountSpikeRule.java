package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import java.time.Duration;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/** Правило суммы: потрачено слишком много по одной карте за 10 минут. Ключ потока это cardId. */
public class AmountSpikeRule extends KeyedProcessFunction<String, PaymentEvent, FraudAlert> {

    public static final String RULE_ID = "amount-spike";
    private static final Duration WINDOW = Duration.ofMinutes(10);
    private static final Duration BUCKET = Duration.ofMinutes(1);

    private final long limitMinor;
    private transient BucketedSum amounts;
    private transient ValueState<Long> lastAlertAtMs;

    public AmountSpikeRule(long limitMinor) {
        this.limitMinor = limitMinor;
    }

    @Override
    public void open(OpenContext context) {
        amounts = new BucketedSum(getRuntimeContext().getMapState(
                new MapStateDescriptor<>("amounts", Long.class, Long.class)), BUCKET);
        lastAlertAtMs = getRuntimeContext().getState(new ValueStateDescriptor<>("last-alert-at", Long.class));
    }

    @Override
    public void processElement(PaymentEvent payment, Context context, Collector<FraudAlert> out) throws Exception {
        long eventTime = payment.eventTimeMs();
        amounts.add(eventTime, payment.amountMinor());
        context.timerService().registerEventTimeTimer(amounts.bucketEnd(eventTime) + WINDOW.toMillis());

        long spent = amounts.sumSince(eventTime - WINDOW.toMillis());
        if (spent > limitMinor && alertIsDue(eventTime)) {
            lastAlertAtMs.update(eventTime);
            out.collect(FraudAlert.of(RULE_ID, payment, "потрачено " + spent + " за 10 минут"));
        }
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext context, Collector<FraudAlert> out) throws Exception {
        amounts.evictBefore(timestamp - WINDOW.toMillis());
    }

    private boolean alertIsDue(long eventTime) throws Exception {
        Long last = lastAlertAtMs.value();
        return last == null || eventTime - last >= WINDOW.toMillis();
    }
}
