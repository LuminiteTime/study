package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import java.util.HashMap;
import java.util.Map;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.functions.RichMapFunction;
import org.apache.flink.metrics.Counter;

/** Считает алерты по правилам. Запись не меняет, поэтому оператор можно ставить в любое место потока. */
public class AlertMetrics extends RichMapFunction<FraudAlert, FraudAlert> {

    private transient Map<String, Counter> countersByRule;

    @Override
    public void open(OpenContext context) {
        countersByRule = new HashMap<>();
    }

    @Override
    public FraudAlert map(FraudAlert alert) {
        countersByRule.computeIfAbsent(alert.ruleId(), this::newCounter).inc();
        return alert;
    }

    // Пара «имя группы и значение» превращается в метку Prometheus: rule="velocity".
    private Counter newCounter(String ruleId) {
        return getRuntimeContext().getMetricGroup().addGroup("rule", ruleId).counter("alerts");
    }
}
