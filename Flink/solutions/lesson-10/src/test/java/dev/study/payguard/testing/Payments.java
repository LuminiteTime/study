package dev.study.payguard.testing;

import dev.study.payguard.model.PaymentEvent;
import java.util.List;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;

/** Заготовки платежей для тестов. */
public final class Payments {

    public static PaymentEvent payment(String id, String card, String merchant, long amount, long eventTimeMs) {
        return new PaymentEvent(id, card, merchant, amount, "EUR", "DE", eventTimeMs);
    }

    public static PaymentEvent paymentOnCard(String id, String card, long eventTimeMs) {
        return payment(id, card, "m1", 1_000, eventTimeMs);
    }

    /** Поток из готовых событий. Когда данные кончаются, watermark уходит в бесконечность и окна закрываются. */
    public static DataStream<PaymentEvent> streamOf(StreamExecutionEnvironment env, List<PaymentEvent> payments) {
        return env.fromData(payments).assignTimestampsAndWatermarks(
                WatermarkStrategy.<PaymentEvent>forMonotonousTimestamps()
                        .withTimestampAssigner((payment, recordTimestamp) -> payment.eventTimeMs()));
    }

    private Payments() {
    }
}
