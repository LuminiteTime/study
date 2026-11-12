package dev.study.payguard.loadgen;

import java.time.Duration;
import java.util.Properties;
import java.util.Random;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;

/** Пишет поток платежей в Kafka с заданной скоростью, пока процесс не остановят. */
public final class LoadGenerator {

    private static final Duration TICK = Duration.ofMillis(100);
    private static final long REPORT_EVERY_RECORDS = 1_000;

    public static void main(String[] args) throws InterruptedException {
        GeneratorConfig config = GeneratorConfig.fromArgs(args);
        Random random = new Random();
        RawRecordSource source = new RawRecordSource(
                new PaymentFactory(random, config.lateShare()), random,
                config.duplicateShare(), config.badShare(), config.burstShare());

        try (KafkaProducer<String, String> producer = new KafkaProducer<>(producerProperties(config))) {
            produceForever(producer, source, config);
        }
    }

    private static void produceForever(
            KafkaProducer<String, String> producer, RawRecordSource source, GeneratorConfig config)
            throws InterruptedException {
        int recordsPerTick = Math.max(1, config.ratePerSecond() / 10);
        long sent = 0;
        while (!Thread.currentThread().isInterrupted()) {
            for (int i = 0; i < recordsPerTick; i++) {
                producer.send(new ProducerRecord<>(config.topic(), source.next(System.currentTimeMillis())));
                if (++sent % REPORT_EVERY_RECORDS == 0) {
                    System.out.println("Отправлено записей: " + sent);
                }
            }
            Thread.sleep(TICK.toMillis());
        }
    }

    private static Properties producerProperties(GeneratorConfig config) {
        Properties properties = new Properties();
        properties.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, config.bootstrapServers());
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        return properties;
    }

    private LoadGenerator() {
    }
}
