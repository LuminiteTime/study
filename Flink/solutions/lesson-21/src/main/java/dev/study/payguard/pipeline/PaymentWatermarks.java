package dev.study.payguard.pipeline;

import dev.study.payguard.model.ParsedRecord;
import java.time.Duration;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;

/** Единственное место, где описано, как задание понимает время событий. */
public final class PaymentWatermarks {

    public static final Duration MAX_OUT_OF_ORDERNESS = Duration.ofSeconds(10);
    public static final Duration IDLE_AFTER = Duration.ofMinutes(1);

    public static WatermarkStrategy<ParsedRecord> strategy() {
        return WatermarkStrategy.<ParsedRecord>forBoundedOutOfOrderness(MAX_OUT_OF_ORDERNESS)
                .withTimestampAssigner((record, kafkaTimestamp) ->
                        record.isAccepted() ? record.payment().eventTimeMs() : kafkaTimestamp)
                .withIdleness(IDLE_AFTER);
    }

    private PaymentWatermarks() {
    }
}
