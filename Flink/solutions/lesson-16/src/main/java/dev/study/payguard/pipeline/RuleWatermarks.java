package dev.study.payguard.pipeline;

import dev.study.payguard.model.RuleConfig;
import org.apache.flink.api.common.eventtime.Watermark;
import org.apache.flink.api.common.eventtime.WatermarkGenerator;
import org.apache.flink.api.common.eventtime.WatermarkOutput;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;

/**
 * Поток настроек не должен тормозить время основного потока. Оператор с двумя входами берёт минимум
 * из двух watermark, поэтому здесь watermark всегда равен максимально возможному значению.
 */
public final class RuleWatermarks {

    public static WatermarkStrategy<RuleConfig> neverHoldBack() {
        return WatermarkStrategy.forGenerator(context -> new WatermarkGenerator<>() {
            @Override
            public void onEvent(RuleConfig rule, long eventTimestamp, WatermarkOutput output) {
            }

            @Override
            public void onPeriodicEmit(WatermarkOutput output) {
                output.emitWatermark(new Watermark(Long.MAX_VALUE));
            }
        });
    }

    private RuleWatermarks() {
    }
}
