package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RuleConfig;
import java.time.Duration;
import java.util.List;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.BroadcastState;
import org.apache.flink.api.common.state.MapStateDescriptor;
import org.apache.flink.api.common.state.ReadOnlyBroadcastState;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.api.common.typeinfo.Types;
import org.apache.flink.streaming.api.functions.co.KeyedBroadcastProcessFunction;
import org.apache.flink.util.Collector;

/** Правила с настройками, которые меняются без перезапуска. Ключ платёжного потока это cardId. */
public class DynamicRules extends KeyedBroadcastProcessFunction<String, PaymentEvent, RuleConfig, FraudAlert> {

    public static final String VELOCITY_RULE = "velocity";
    public static final String BLOCKED_COUNTRY_RULE = "blocked-country";
    public static final MapStateDescriptor<String, RuleConfig> RULES =
            new MapStateDescriptor<>("rules", Types.STRING, Types.POJO(RuleConfig.class));

    private static final String CURRENT = "current";
    private static final Duration WINDOW = Duration.ofMinutes(1);
    private static final Duration BUCKET = Duration.ofSeconds(10);

    private final RuleConfig defaults;
    private transient BucketedSum counts;
    private transient ValueState<Long> lastVelocityAlertAtMs;

    public DynamicRules(RuleConfig defaults) {
        this.defaults = defaults;
    }

    @Override
    public void open(OpenContext context) {
        counts = new BucketedSum(getRuntimeContext().getMapState(
                new MapStateDescriptor<>("payment-counts", Long.class, Long.class)), BUCKET);
        lastVelocityAlertAtMs = getRuntimeContext().getState(new ValueStateDescriptor<>("last-alert-at", Long.class));
    }

    @Override
    public void processElement(PaymentEvent payment, ReadOnlyContext context, Collector<FraudAlert> out) throws Exception {
        RuleConfig rules = currentRules(context.getBroadcastState(RULES));
        checkBlockedCountry(payment, rules, out);
        checkVelocity(payment, rules, context, out);
    }

    @Override
    public void processBroadcastElement(RuleConfig update, Context context, Collector<FraudAlert> out) throws Exception {
        BroadcastState<String, RuleConfig> state = context.getBroadcastState(RULES);
        state.put(CURRENT, update);
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext context, Collector<FraudAlert> out) throws Exception {
        counts.evictBefore(timestamp - WINDOW.toMillis());
    }

    private RuleConfig currentRules(ReadOnlyBroadcastState<String, RuleConfig> state) throws Exception {
        RuleConfig rules = state.get(CURRENT);
        return rules != null ? rules : defaults;
    }

    private void checkBlockedCountry(PaymentEvent payment, RuleConfig rules, Collector<FraudAlert> out) {
        List<String> blocked = rules.blockedCountries();
        if (blocked != null && blocked.contains(payment.country())) {
            out.collect(FraudAlert.of(BLOCKED_COUNTRY_RULE, payment, "страна " + payment.country() + " заблокирована"));
        }
    }

    private void checkVelocity(PaymentEvent payment, RuleConfig rules, ReadOnlyContext context, Collector<FraudAlert> out)
            throws Exception {
        long eventTime = payment.eventTimeMs();
        counts.add(eventTime, 1);
        context.timerService().registerEventTimeTimer(counts.bucketEnd(eventTime) + WINDOW.toMillis());

        long recent = counts.sumSince(eventTime - WINDOW.toMillis());
        if (recent > rules.velocityMaxPayments() && velocityAlertIsDue(eventTime)) {
            lastVelocityAlertAtMs.update(eventTime);
            out.collect(FraudAlert.of(VELOCITY_RULE, payment, recent + " платежей за минуту"));
        }
    }

    private boolean velocityAlertIsDue(long eventTime) throws Exception {
        Long last = lastVelocityAlertAtMs.value();
        return last == null || eventTime - last >= WINDOW.toMillis();
    }
}
