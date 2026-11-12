package dev.study.payguard.job;

import java.io.Serializable;
import org.apache.flink.util.ParameterTool;

/** Настройки задания из аргументов командной строки: один и тот же jar работает на любом стенде. */
public record JobConfig(String bootstrapServers, String rawTopic, String dlqTopic, String groupId)
        implements Serializable {

    public static JobConfig fromArgs(String[] args) {
        ParameterTool params = ParameterTool.fromArgs(args);
        return new JobConfig(
                params.get("bootstrap", "kafka:9092"),
                params.get("raw-topic", "payments.raw"),
                params.get("dlq-topic", "payments.dlq"),
                params.get("group-id", "payguard"));
    }
}
