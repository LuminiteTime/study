package dev.study.payguard.job;

import java.io.Serializable;
import org.apache.flink.util.ParameterTool;

/** Настройки задания из аргументов командной строки: один и тот же jar работает на любом стенде. */
public record JobConfig(
        String bootstrapServers,
        String rawTopic,
        String dlqTopic,
        String lateTopic,
        String merchantStatsTopic,
        String cardSessionsTopic,
        String alertsTopic,
        String rulesTopic,
        String confirmationsTopic,
        String confirmedTopic,
        int velocityMaxPayments,
        long amountSpikeLimitMinor,
        String groupId) implements Serializable {

    public static JobConfig fromArgs(String[] args) {
        ParameterTool params = ParameterTool.fromArgs(args);
        return new JobConfig(
                params.get("bootstrap", "kafka:9092"),
                params.get("raw-topic", "payments.raw"),
                params.get("dlq-topic", "payments.dlq"),
                params.get("late-topic", "payments.late"),
                params.get("merchant-stats-topic", "merchant.stats"),
                params.get("card-sessions-topic", "card.sessions"),
                params.get("alerts-topic", "fraud.alerts"),
                params.get("rules-topic", "rules.config"),
                params.get("confirmations-topic", "payments.confirmations"),
                params.get("confirmed-topic", "payments.confirmed"),
                params.getInt("velocity-max-payments", 10),
                params.getLong("amount-spike-limit-minor", 2_000_000),
                params.get("group-id", "payguard"));
    }
}
