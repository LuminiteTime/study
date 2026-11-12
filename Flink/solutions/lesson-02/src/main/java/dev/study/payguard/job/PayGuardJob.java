package dev.study.payguard.job;

import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

/** Точка входа Flink-задания PayGuard. */
public final class PayGuardJob {

    private static final String BOOTSTRAP_SERVERS = "kafka:9092";
    private static final String RAW_TOPIC = "payments.raw";

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        KafkaSource<String> source = KafkaSource.<String>builder()
                .setBootstrapServers(BOOTSTRAP_SERVERS)
                .setTopics(RAW_TOPIC)
                .setGroupId("payguard")
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();

        env.fromSource(source, WatermarkStrategy.noWatermarks(), "payments-raw")
                .uid("payments-raw")
                .filter(record -> !record.isBlank())
                .name("drop-blank")
                .uid("drop-blank")
                .print()
                .name("stdout")
                .uid("stdout");

        System.out.println(env.getExecutionPlan());
        env.execute("payguard");
    }

    private PayGuardJob() {
    }
}
