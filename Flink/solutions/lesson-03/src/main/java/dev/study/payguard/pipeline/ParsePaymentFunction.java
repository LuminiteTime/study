package dev.study.payguard.pipeline;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import java.util.Optional;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

/** Разбирает и проверяет платёж. Всё непригодное уходит в побочный выход, а не роняет задание. */
public class ParsePaymentFunction extends ProcessFunction<String, PaymentEvent> {

    public static final OutputTag<RejectedRecord> REJECTED = new OutputTag<>("rejected") {
    };

    private transient ObjectMapper mapper;

    @Override
    public void open(OpenContext context) {
        mapper = new ObjectMapper();
    }

    @Override
    public void processElement(String raw, Context context, Collector<PaymentEvent> out) {
        try {
            PaymentEvent payment = mapper.readValue(raw, PaymentEvent.class);
            Optional<String> reason = PaymentValidator.rejectionReason(payment);
            if (reason.isPresent()) {
                reject(context, raw, reason.get());
            } else {
                out.collect(payment);
            }
        } catch (JsonProcessingException e) {
            reject(context, raw, "bad-json");
        }
    }

    private static void reject(Context context, String raw, String reason) {
        context.output(REJECTED, new RejectedRecord(raw, reason, System.currentTimeMillis()));
    }
}
