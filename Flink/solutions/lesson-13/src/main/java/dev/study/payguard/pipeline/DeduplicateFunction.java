package dev.study.payguard.pipeline;

import dev.study.payguard.model.PaymentEvent;
import java.io.IOException;
import java.time.Duration;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.StateTtlConfig;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/** Пропускает только первый платёж с данным paymentId. Память о платеже живёт {@link #REMEMBER_FOR}. */
public class DeduplicateFunction extends KeyedProcessFunction<String, PaymentEvent, PaymentEvent> {

    public static final Duration REMEMBER_FOR = Duration.ofHours(1);

    private transient ValueState<Boolean> seen;

    @Override
    public void open(OpenContext context) {
        ValueStateDescriptor<Boolean> descriptor = new ValueStateDescriptor<>("seen", Boolean.class);
        descriptor.enableTimeToLive(StateTtlConfig.newBuilder(REMEMBER_FOR).build());
        seen = getRuntimeContext().getState(descriptor);
    }

    @Override
    public void processElement(PaymentEvent payment, Context context, Collector<PaymentEvent> out) throws IOException {
        if (seen.value() == null) {
            seen.update(true);
            out.collect(payment);
        }
    }
}
