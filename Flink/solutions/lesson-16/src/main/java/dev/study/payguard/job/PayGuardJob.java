package dev.study.payguard.job;

import dev.study.payguard.model.CardProfile;
import dev.study.payguard.model.CardSession;
import dev.study.payguard.model.ConfirmedPayment;
import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.MerchantStats;
import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentConfirmation;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import dev.study.payguard.model.RuleConfig;
import dev.study.payguard.pipeline.AlertEnrichment;
import dev.study.payguard.pipeline.AmountSpikeRule;
import dev.study.payguard.pipeline.CardProfileFunction;
import dev.study.payguard.pipeline.CardSessionWindow;
import dev.study.payguard.pipeline.DeduplicateFunction;
import dev.study.payguard.pipeline.DynamicRules;
import dev.study.payguard.pipeline.FraudPatterns;
import dev.study.payguard.pipeline.JdbcMerchantDirectory;
import dev.study.payguard.pipeline.LatenessProbe;
import dev.study.payguard.pipeline.LenientJsonSchema;
import dev.study.payguard.pipeline.MerchantStatsWindow;
import dev.study.payguard.pipeline.ParsedRecordSchema;
import dev.study.payguard.pipeline.PaymentConfirmationJoin;
import dev.study.payguard.pipeline.PaymentWatermarks;
import dev.study.payguard.pipeline.RuleWatermarks;
import dev.study.payguard.pipeline.SplitParsedRecords;
import dev.study.payguard.pipeline.UnconfirmedPaymentFunction;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.PipelineOptions;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.streaming.api.datastream.AsyncDataStream;
import org.apache.flink.streaming.api.datastream.BroadcastStream;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.KeyedStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.kafka.clients.consumer.OffsetResetStrategy;

/** Точка входа Flink-задания PayGuard. */
public final class PayGuardJob {

    private static final int DB_POOL_SIZE = 8;
    private static final Duration ENRICHMENT_TIMEOUT = Duration.ofSeconds(2);
    private static final int ENRICHMENT_CAPACITY = 200;

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = createEnvironment();
        buildPipeline(env, JobConfig.fromArgs(args));
        env.execute("payguard");
    }

    /** Окружение с запретом на Kryo. Тесты берут его же, чтобы проверять те же условия, что и в проде. */
    public static StreamExecutionEnvironment createEnvironment() {
        Configuration flinkConfig = new Configuration();
        flinkConfig.set(PipelineOptions.GENERIC_TYPES, false);
        return StreamExecutionEnvironment.getExecutionEnvironment(flinkConfig);
    }

    /** Описывает весь граф задания, но не запускает его. Отдельный метод нужен тестам топологии и E2E. */
    public static void buildPipeline(StreamExecutionEnvironment env, JobConfig config) {
        DataStream<PaymentEvent> payments = parsePayments(env, config);
        attachMerchantStats(payments, config);
        attachCardSessions(payments, config);

        KeyedStream<PaymentEvent, String> byCard = payments.keyBy(PaymentEvent::cardId);
        attachCardProfiles(byCard, config);

        DataStream<PaymentConfirmation> confirmations = env
                .fromSource(confirmationSource(config), confirmationWatermarks(), "payment-confirmations")
                .uid("payment-confirmations");
        attachConfirmedPayments(payments, confirmations, config);
        DataStream<FraudAlert> unconfirmedAlerts = unconfirmedAlerts(payments, confirmations);
        sinkAlerts(fraudAlerts(env, byCard, unconfirmedAlerts, config), config);
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
                .sinkTo(JdbcSinks.merchantStats())
                .name("merchant-stats-postgres")
                .uid("merchant-stats-postgres");
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

    private static void attachCardProfiles(KeyedStream<PaymentEvent, String> byCard, JobConfig config) {
        byCard.process(new CardProfileFunction())
                .name("card-profile")
                .uid(CardProfileFunction.UID)
                .sinkTo(KafkaSinks.<CardProfile>atLeastOnceJson(config.bootstrapServers(), config.cardProfilesTopic()))
                .name("card-profiles-sink")
                .uid("card-profiles-sink");
    }

    private static void attachConfirmedPayments(
            DataStream<PaymentEvent> payments, DataStream<PaymentConfirmation> confirmations, JobConfig config) {
        PaymentConfirmationJoin.attach(payments, confirmations)
                .sinkTo(KafkaSinks.<ConfirmedPayment>atLeastOnceJson(config.bootstrapServers(), config.confirmedTopic()))
                .name("confirmed-sink")
                .uid("confirmed-sink");
    }

    /** Алерт по платежу, подтверждение которого не пришло вовремя. */
    private static DataStream<FraudAlert> unconfirmedAlerts(
            DataStream<PaymentEvent> payments, DataStream<PaymentConfirmation> confirmations) {
        return payments.keyBy(PaymentEvent::paymentId)
                .connect(confirmations.keyBy(PaymentConfirmation::paymentId))
                .process(new UnconfirmedPaymentFunction(PaymentConfirmationJoin.MAX_DELAY.toMillis()))
                .name("rule-unconfirmed")
                .uid("rule-unconfirmed");
    }

    /** Все правила антифрода, сведённые в один поток алертов. */
    private static DataStream<FraudAlert> fraudAlerts(
            StreamExecutionEnvironment env,
            KeyedStream<PaymentEvent, String> byCard,
            DataStream<FraudAlert> unconfirmedAlerts,
            JobConfig config) {
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

        return dynamicAlerts.union(
                amountAlerts,
                unconfirmedAlerts,
                FraudPatterns.cardTestingAlerts(byCard),
                FraudPatterns.impossibleTravelAlerts(byCard));
    }

    private static void sinkAlerts(DataStream<FraudAlert> allAlerts, JobConfig config) {
        AsyncDataStream
                .unorderedWait(
                        allAlerts,
                        new AlertEnrichment(() -> JdbcMerchantDirectory.fromEnvironment(DB_POOL_SIZE)),
                        ENRICHMENT_TIMEOUT.toMillis(),
                        TimeUnit.MILLISECONDS,
                        ENRICHMENT_CAPACITY)
                .name("enrich-alerts")
                .uid("enrich-alerts")
                .sinkTo(KafkaSinks.<FraudAlert>exactlyOnceJson(
                        config.bootstrapServers(), config.alertsTopic(), config.alertsTransactionalIdPrefix()))
                .name("alerts-sink")
                .uid("alerts-sink");
    }

    private static KafkaSource<ParsedRecord> paymentSource(JobConfig config) {
        return KafkaSource.<ParsedRecord>builder()
                .setBootstrapServers(config.bootstrapServers())
                .setTopics(config.rawTopic())
                .setGroupId(config.groupId())
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.LATEST))
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

    private static KafkaSource<PaymentConfirmation> confirmationSource(JobConfig config) {
        return KafkaSource.<PaymentConfirmation>builder()
                .setBootstrapServers(config.bootstrapServers())
                .setTopics(config.confirmationsTopic())
                .setGroupId(config.groupId() + "-confirmations")
                .setStartingOffsets(OffsetsInitializer.committedOffsets(OffsetResetStrategy.LATEST))
                .setValueOnlyDeserializer(new LenientJsonSchema<>(PaymentConfirmation.class))
                .build();
    }

    private static WatermarkStrategy<PaymentConfirmation> confirmationWatermarks() {
        return WatermarkStrategy.<PaymentConfirmation>forBoundedOutOfOrderness(PaymentWatermarks.MAX_OUT_OF_ORDERNESS)
                .withTimestampAssigner((confirmation, kafkaTimestamp) -> confirmation.eventTimeMs())
                .withIdleness(PaymentWatermarks.IDLE_AFTER);
    }

    private PayGuardJob() {
    }
}
