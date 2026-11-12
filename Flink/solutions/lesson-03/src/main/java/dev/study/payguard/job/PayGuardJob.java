package dev.study.payguard.job;

import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import dev.study.payguard.pipeline.ParsePaymentFunction;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.PipelineOptions;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

/** Точка входа Flink-задания PayGuard. */
public final class PayGuardJob {

    public static void main(String[] args) throws Exception {
        JobConfig config = JobConfig.fromArgs(args);

        Configuration flinkConfig = new Configuration();
        flinkConfig.set(PipelineOptions.GENERIC_TYPES, false);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment(flinkConfig);

        SingleOutputStreamOperator<PaymentEvent> payments = env
                .fromSource(rawSource(config), WatermarkStrategy.noWatermarks(), "payments-raw")
                .uid("payments-raw")
                .process(new ParsePaymentFunction())
                .name("parse-payment")
                .uid("parse-payment");

        payments.getSideOutput(ParsePaymentFunction.REJECTED)
                .sinkTo(KafkaSinks.<RejectedRecord>atLeastOnceJson(config.bootstrapServers(), config.dlqTopic()))
                .name("dlq-sink")
                .uid("dlq-sink");

        payments.print().name("stdout").uid("stdout");

        env.execute("payguard");
    }

    private static KafkaSource<String> rawSource(JobConfig config) {
        return KafkaSource.<String>builder()
                .setBootstrapServers(config.bootstrapServers())
                .setTopics(config.rawTopic())
                .setGroupId(config.groupId())
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .build();
    }

    private PayGuardJob() {
    }
}
