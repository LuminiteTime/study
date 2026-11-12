package dev.study.payguard.pipeline;

import dev.study.payguard.model.ParsedRecord;
import dev.study.payguard.model.PaymentEvent;
import dev.study.payguard.model.RejectedRecord;
import org.apache.flink.streaming.api.functions.ProcessFunction;
import org.apache.flink.util.Collector;
import org.apache.flink.util.OutputTag;

/** Разводит принятые платежи в основной выход, а отклонённые записи в побочный. */
public class SplitParsedRecords extends ProcessFunction<ParsedRecord, PaymentEvent> {

    public static final OutputTag<RejectedRecord> REJECTED = new OutputTag<>("rejected") {
    };

    @Override
    public void processElement(ParsedRecord record, Context context, Collector<PaymentEvent> out) {
        if (record.isAccepted()) {
            out.collect(record.payment());
        } else {
            context.output(REJECTED, record.rejected());
        }
    }
}
