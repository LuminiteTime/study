package dev.study.payguard.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.flink.core.execution.JobClient;
import org.apache.flink.runtime.testutils.MiniClusterResourceConfiguration;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.test.junit5.MiniClusterExtension;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

/** Настоящие Kafka и PostgreSQL, настоящий граф задания, настоящие транзакции и чекпоинты. */
@Tag("e2e")
@Testcontainers
class PayGuardE2ETest {

    private static final Duration DEADLINE = Duration.ofMinutes(2);
    private static final int BURST_SIZE = 12;

    @Container
    private static final KafkaContainer KAFKA = new KafkaContainer("apache/kafka:4.3.2");

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:17-alpine")
            .withDatabaseName("payguard")
            .withUsername("payguard")
            .withPassword("payguard")
            .withCopyFileToContainer(MountableFile.forHostPath("sql/init.sql"), "/docker-entrypoint-initdb.d/init.sql");

    @RegisterExtension
    private static final MiniClusterExtension FLINK = new MiniClusterExtension(
            new MiniClusterResourceConfiguration.Builder().setNumberTaskManagers(1).setNumberSlotsPerTaskManager(8).build());

    @BeforeAll
    static void createTopics() throws Exception {
        System.setProperty("PAYGUARD_DB_URL", POSTGRES.getJdbcUrl());
        System.setProperty("PAYGUARD_DB_USER", POSTGRES.getUsername());
        System.setProperty("PAYGUARD_DB_PASSWORD", POSTGRES.getPassword());

        List<NewTopic> topics = List.of("payments.raw", "payments.dlq", "payments.late", "payments.confirmations",
                        "payments.confirmed", "card.sessions", "card.profiles", "fraud.alerts", "rules.config")
                .stream().map(name -> new NewTopic(name, 2, (short) 1)).toList();
        try (Admin admin = Admin.create(Map.<String, Object>of("bootstrap.servers", KAFKA.getBootstrapServers()))) {
            admin.createTopics(topics).all().get();
        }
    }

    @Test
    void burstOnCardBecomesCommittedEnrichedAlertAndGarbageGoesToDlq() throws Exception {
        StreamExecutionEnvironment env = PayGuardJob.createEnvironment();
        env.enableCheckpointing(1_000);
        env.setParallelism(2);
        PayGuardJob.buildPipeline(env, JobConfig.fromArgs(new String[] {"--bootstrap", KAFKA.getBootstrapServers()}));
        JobClient job = env.executeAsync("payguard-e2e");

        try (KafkaProducer<String, String> producer = newProducer();
                KafkaConsumer<String, String> consumer = newConsumer()) {
            consumer.subscribe(List.of("fraud.alerts", "payments.dlq"));
            String alert = null;
            String rejected = null;
            Instant deadline = Instant.now().plus(DEADLINE);

            // Источник читает с конца топика и стартует не сразу, поэтому пачку шлём, пока не увидим результат.
            while ((alert == null || rejected == null) && Instant.now().isBefore(deadline)) {
                sendBurst(producer);
                for (ConsumerRecord<String, String> record : consumer.poll(Duration.ofSeconds(1))) {
                    if (record.topic().equals("fraud.alerts") && record.value().contains("\"velocity\"")) {
                        alert = record.value();
                    } else if (record.topic().equals("payments.dlq")) {
                        rejected = record.value();
                    }
                }
            }

            assertThat(alert).contains("\"cardId\":\"c-e2e\"").contains("\"merchantRisk\":\"HIGH\"");
            assertThat(rejected).contains("not-json");
        } finally {
            job.cancel().get();
        }
    }

    private static void sendBurst(KafkaProducer<String, String> producer) {
        long now = System.currentTimeMillis();
        for (int i = 0; i < BURST_SIZE; i++) {
            String json = """
                    {"paymentId":"%s","cardId":"c-e2e","merchantId":"m-0000","amountMinor":1000,\
                    "currency":"EUR","country":"DE","eventTimeMs":%d}""".formatted(UUID.randomUUID(), now);
            producer.send(new ProducerRecord<>("payments.raw", "c-e2e", json));
        }
        producer.send(new ProducerRecord<>("payments.raw", "c-e2e", "not-json"));
        producer.flush();
    }

    private static KafkaProducer<String, String> newProducer() {
        return new KafkaProducer<>(Map.<String, Object>of(
                ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName(),
                ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName()));
    }

    private static KafkaConsumer<String, String> newConsumer() {
        return new KafkaConsumer<>(Map.<String, Object>of(
                ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, KAFKA.getBootstrapServers(),
                ConsumerConfig.GROUP_ID_CONFIG, "e2e-check",
                ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest",
                ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed",
                ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName(),
                ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName()));
    }
}
