package dev.study.payguard.job;

import dev.study.payguard.model.MerchantTotal;
import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import dev.study.payguard.pipeline.LatenessProbe;
import dev.study.payguard.pipeline.ParsedRecordSchema;
import dev.study.payguard.pipeline.PaymentWatermarks;
import dev.study.payguard.pipeline.SplitParsedRecords;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.PipelineOptions;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

/** Точка входа Flink-задания PayGuard. */
public final class PayGuardJob {

    public static void main(String[] args) throws Exception {
        JobConfig config = JobConfig.fromArgs(args);

        Configuration flinkConfig = new Configuration();
        flinkConfig.set(PipelineOptions.GENERIC_TYPES, false);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment(flinkConfig);

        SingleOutputStreamOperator<PaymentEvent> split = env
                .fromSource(paymentSource(config), PaymentWatermarks.strategy(), "payments-raw")
                .uid("payments-raw")
                .process(new SplitParsedRecords())
                .name("split-parsed")
                .uid("split-parsed");

        split.getSideOutput(SplitParsedRecords.REJECTED)
                .sinkTo(KafkaSinks.<RejectedRecord>atLeastOnceJson(config.bootstrapServers(), config.dlqTopic()))
                .name("dlq-sink")
                .uid("dlq-sink");

        DataStream<PaymentEvent> payments = split
                .process(new LatenessProbe())
                .name("lateness-probe")
                .uid("lateness-probe");

        payments.map(MerchantTotal::of)
                .name("to-merchant-total")
                .uid("to-merchant-total")
                .keyBy(MerchantTotal::merchantId)
                .reduce(MerchantTotal::plus)
                .name("merchant-running-total")
                .uid("merchant-running-total")
                .print()
                .name("stdout")
                .uid("stdout");

        env.execute("payguard");
    }

    private static KafkaSource<ParsedRecord> paymentSource(JobConfig config) {
        return KafkaSource.<ParsedRecord>builder()
                .setBootstrapServers(config.bootstrapServers())
                .setTopics(config.rawTopic())
                .setGroupId(config.groupId())
                .setStartingOffsets(OffsetsInitializer.latest())
                .setValueOnlyDeserializer(new ParsedRecordSchema())
                .build();
    }

    private PayGuardJob() {
    }
}
