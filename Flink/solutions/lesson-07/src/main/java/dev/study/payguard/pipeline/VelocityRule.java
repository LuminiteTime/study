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

/** Правило частоты: слишком много платежей по одной карте за скользящую минуту. Ключ потока это cardId. */
public class VelocityRule extends KeyedProcessFunction<String, PaymentEvent, FraudAlert> {

    public static final String RULE_ID = "velocity";
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final Duration BUCKET = Duration.ofSeconds(10);

    private final int maxPayments;
    private transient BucketedSum counts;
    private transient ValueState<Long> lastAlertAtMs;

    public VelocityRule(int maxPayments) {
        this.maxPayments = maxPayments;
    }

    @Override
    public void open(OpenContext context) {
        counts = new BucketedSum(getRuntimeContext().getMapState(
                new MapStateDescriptor<>("payment-counts", Long.class, Long.class)), BUCKET);
        lastAlertAtMs = getRuntimeContext().getState(new ValueStateDescriptor<>("last-alert-at", Long.class));
    }

    @Override
    public void processElement(PaymentEvent payment, Context context, Collector<FraudAlert> out) throws Exception {
        long eventTime = payment.eventTimeMs();
        counts.add(eventTime, 1);
        context.timerService().registerEventTimeTimer(counts.bucketEnd(eventTime) + WINDOW.toMillis());

        long recentPayments = counts.sumSince(eventTime - WINDOW.toMillis());
        if (recentPayments > maxPayments && alertIsDue(eventTime)) {
            lastAlertAtMs.update(eventTime);
            out.collect(FraudAlert.of(RULE_ID, payment, recentPayments + " платежей за минуту"));
        }
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext context, Collector<FraudAlert> out) throws Exception {
        counts.evictBefore(timestamp - WINDOW.toMillis());
    }

    private boolean alertIsDue(long eventTime) throws Exception {
        Long last = lastAlertAtMs.value();
        return last == null || eventTime - last >= WINDOW.toMillis();
    }
}
