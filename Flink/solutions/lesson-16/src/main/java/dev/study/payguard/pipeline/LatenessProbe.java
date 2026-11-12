package dev.study.payguard.pipeline;

import dev.study.payguard.model.PaymentEvent;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.metrics.Counter;
import org.apache.flink.metrics.Histogram;
import org.apache.flink.runtime.metrics.DescriptiveStatisticsHistogram;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;

/** Измеряет, насколько события отстают от watermark. По этим числам выбирают допуск беспорядка. */
public class LatenessProbe extends ProcessFunction<PaymentEvent, PaymentEvent> {

    private static final int HISTOGRAM_WINDOW = 10_000;

    private transient Counter lateEvents;
    private transient Histogram behindWatermarkMs;

    @Override
    public void open(OpenContext context) {
        lateEvents = getRuntimeContext().getMetricGroup().counter("lateEvents");
        behindWatermarkMs = getRuntimeContext().getMetricGroup()
                .histogram("behindWatermarkMs", new DescriptiveStatisticsHistogram(HISTOGRAM_WINDOW));
    }

    @Override
    public void processElement(PaymentEvent payment, Context context, Collector<PaymentEvent> out) {
        long watermark = context.timerService().currentWatermark();
        if (payment.eventTimeMs() <= watermark) {
            lateEvents.inc();
            behindWatermarkMs.update(watermark - payment.eventTimeMs());
        }
        out.collect(payment);
    }
}
