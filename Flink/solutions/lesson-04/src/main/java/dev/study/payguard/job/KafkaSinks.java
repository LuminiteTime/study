package dev.study.payguard.job;

import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.formats.json.JsonSerializationSchema;

/** Единая сборка приёмников Kafka, которые пишут объекты как JSON. */
final class KafkaSinks {

    static <T> KafkaSink<T> atLeastOnceJson(String bootstrapServers, String topic) {
        return KafkaSink.<T>builder()
                .setBootstrapServers(bootstrapServers)
                .setRecordSerializer(KafkaRecordSerializationSchema.<T>builder()
                        .setTopic(topic)
                        .setValueSerializationSchema(new JsonSerializationSchema<T>())
                        .build())
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .build();
    }

    private KafkaSinks() {
    }
}
