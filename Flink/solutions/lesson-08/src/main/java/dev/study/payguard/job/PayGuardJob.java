package dev.study.payguard.job;

import dev.study.payguard.model.CardSession;
import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import dev.study.payguard.model.RuleConfig;
import dev.study.payguard.pipeline.AmountSpikeRule;
import dev.study.payguard.pipeline.CardSessionWindow;
import dev.study.payguard.pipeline.DeduplicateFunction;
import dev.study.payguard.pipeline.DynamicRules;
import dev.study.payguard.pipeline.LatenessProbe;
import dev.study.payguard.pipeline.LenientJsonSchema;
import dev.study.payguard.pipeline.MerchantStatsWindow;
import dev.study.payguard.pipeline.ParsedRecordSchema;
import dev.study.payguard.pipeline.PaymentWatermarks;
import dev.study.payguard.pipeline.RuleWatermarks;
import dev.study.payguard.pipeline.SplitParsedRecords;
import java.util.List;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.PipelineOptions;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.KeyedStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

/** Точка входа Flink-задания PayGuard. */
public final class PayGuardJob {

    public static void main(String[] args) throws Exception {
        JobConfig config = JobConfig.fromArgs(args);

        Configuration flinkConfig = new Configuration();
        flinkConfig.set(PipelineOptions.GENERIC_TYPES, false);
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment(flinkConfig);

        DataStream<PaymentEvent> payments = parsePayments(env, config);
        attachMerchantStats(payments, config);
        attachCardSessions(payments, config);

        KeyedStream<PaymentEvent, String> byCard = payments.keyBy(PaymentEvent::cardId);
        sinkAlerts(fraudAlerts(env, byCard, config), config);

        env.execute("payguard");
    }

    /** Разбирает сырые записи: битые уходят в DLQ, остальные становятся очищенным потоком платежей. */
    private static DataStream<PaymentEvent> parsePayments(StreamExecutionEnvironment env, JobConfig config) {
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

        return split
                .process(new LatenessProbe())
                .name("lateness-probe")
                .uid("lateness-probe")
                .keyBy(PaymentEvent::paymentId)
                .process(new DeduplicateFunction())
                .name("deduplicate")
                .uid("deduplicate");
    }

    private static void attachMerchantStats(DataStream<PaymentEvent> payments, JobConfig config) {
        SingleOutputStreamOperator<MerchantStats> merchantStats = MerchantStatsWindow.attach(payments);
        merchantStats
                .sinkTo(KafkaSinks.<MerchantStats>atLeastOnceJson(config.bootstrapServers(), config.merchantStatsTopic()))
                .name("merchant-stats-sink")
                .uid("merchant-stats-sink");
        merchantStats.getSideOutput(MerchantStatsWindow.TOO_LATE)
                .sinkTo(KafkaSinks.<PaymentEvent>atLeastOnceJson(config.bootstrapServers(), config.lateTopic()))
                .name("too-late-sink")
                .uid("too-late-sink");
    }

    private static void attachCardSessions(DataStream<PaymentEvent> payments, JobConfig config) {
        CardSessionWindow.attach(payments)
                .sinkTo(KafkaSinks.<CardSession>atLeastOnceJson(config.bootstrapServers(), config.cardSessionsTopic()))
                .name("card-sessions-sink")
                .uid("card-sessions-sink");
    }

    /** Все правила антифрода, сведённые в один поток алертов. */
    private static DataStream<FraudAlert> fraudAlerts(
            StreamExecutionEnvironment env, KeyedStream<PaymentEvent, String> byCard, JobConfig config) {
        BroadcastStream<RuleConfig> rules = env
                .fromSource(ruleSource(config), RuleWatermarks.neverHoldBack(), "rules-config")
                .uid("rules-config")
                .broadcast(DynamicRules.RULES);

        DataStream<FraudAlert> dynamicAlerts = byCard
                .connect(rules)
                .process(new DynamicRules(new RuleConfig(config.velocityMaxPayments(), List.of())))
                .name("rules-dynamic")
                .uid("rules-dynamic");
        DataStream<FraudAlert> amountAlerts = byCard
                .process(new AmountSpikeRule(config.amountSpikeLimitMinor()))
                .name("rule-amount-spike")
                .uid("rule-amount-spike");

        return dynamicAlerts.union(amountAlerts);
    }

    private static void sinkAlerts(DataStream<FraudAlert> allAlerts, JobConfig config) {
        allAlerts
                .sinkTo(KafkaSinks.<FraudAlert>atLeastOnceJson(config.bootstrapServers(), config.alertsTopic()))
                .name("alerts-sink")
                .uid("alerts-sink");
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

    private static KafkaSource<RuleConfig> ruleSource(JobConfig config) {
        return KafkaSource.<RuleConfig>builder()
                .setBootstrapServers(config.bootstrapServers())
                .setTopics(config.rulesTopic())
                .setGroupId(config.groupId() + "-rules")
                .setStartingOffsets(OffsetsInitializer.earliest())
                .setValueOnlyDeserializer(new LenientJsonSchema<>(RuleConfig.class))
                .build();
    }

    private PayGuardJob() {
    }
}
