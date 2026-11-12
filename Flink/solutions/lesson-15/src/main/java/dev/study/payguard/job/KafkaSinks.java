package dev.study.payguard.job;

import java.time.Duration;
import java.util.Properties;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.formats.json.JsonSerializationSchema;
import org.apache.kafka.clients.producer.ProducerConfig;

/** Единая сборка приёмников Kafka, которые пишут объекты как JSON. */
final class KafkaSinks {

    // Транзакция должна пережить простой между чекпоинтом и восстановлением, иначе брокер её отменит.
    private static final Duration TRANSACTION_TIMEOUT = Duration.ofMinutes(15);

    static <T> KafkaSink<T> atLeastOnceJson(String bootstrapServers, String topic) {
        return KafkaSink.<T>builder()
                .setBootstrapServers(bootstrapServers)
                .setRecordSerializer(jsonSerializer(topic))
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .build();
    }

    static <T> KafkaSink<T> exactlyOnceJson(String bootstrapServers, String topic, String transactionalIdPrefix) {
        Properties producer = new Properties();
        producer.setProperty(ProducerConfig.TRANSACTION_TIMEOUT_CONFIG, String.valueOf(TRANSACTION_TIMEOUT.toMillis()));
        return KafkaSink.<T>builder()
                .setBootstrapServers(bootstrapServers)
                .setRecordSerializer(jsonSerializer(topic))
                .setDeliveryGuarantee(DeliveryGuarantee.EXACTLY_ONCE)
                .setTransactionalIdPrefix(transactionalIdPrefix)
                .setKafkaProducerConfig(producer)
                .build();
    }

    private static <T> KafkaRecordSerializationSchema<T> jsonSerializer(String topic) {
        return KafkaRecordSerializationSchema.<T>builder()
                .setTopic(topic)
                .setValueSerializationSchema(new JsonSerializationSchema<T>())
                .build();
    }

    private KafkaSinks() {
    }
}
