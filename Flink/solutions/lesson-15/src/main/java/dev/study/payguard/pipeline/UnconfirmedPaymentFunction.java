package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import dev.study.payguard.model.PaymentConfirmation;
import dev.study.payguard.model.PaymentEvent;
import java.io.IOException;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.streaming.api.functions.co.KeyedCoProcessFunction;
import org.apache.flink.util.Collector;

/** Алерт, если подтверждение не пришло вовремя. Interval join этого не умеет: он видит только совпавшие пары. */
public class UnconfirmedPaymentFunction
        extends KeyedCoProcessFunction<String, PaymentEvent, PaymentConfirmation, FraudAlert> {

    public static final String RULE_ID = "unconfirmed";

    private final long timeoutMs;
    private transient ValueState<PaymentEvent> waitingPayment;
    private transient ValueState<Boolean> confirmationSeen;

    public UnconfirmedPaymentFunction(long timeoutMs) {
        this.timeoutMs = timeoutMs;
    }

    @Override
    public void open(OpenContext context) {
        waitingPayment = getRuntimeContext().getState(new ValueStateDescriptor<>("waiting-payment", PaymentEvent.class));
        confirmationSeen = getRuntimeContext().getState(new ValueStateDescriptor<>("confirmation-seen", Boolean.class));
    }

    @Override
    public void processElement1(PaymentEvent payment, Context context, Collector<FraudAlert> out) throws IOException {
        if (confirmationSeen.value() != null) {
            confirmationSeen.clear();
            return;
        }
        waitingPayment.update(payment);
        context.timerService().registerEventTimeTimer(payment.eventTimeMs() + timeoutMs);
    }

    @Override
    public void processElement2(PaymentConfirmation confirmation, Context context, Collector<FraudAlert> out)
            throws IOException {
        PaymentEvent payment = waitingPayment.value();
        if (payment == null) {
            confirmationSeen.update(true);
            context.timerService().registerEventTimeTimer(confirmation.eventTimeMs() + timeoutMs);
            return;
        }
        context.timerService().deleteEventTimeTimer(payment.eventTimeMs() + timeoutMs);
        waitingPayment.clear();
    }

    @Override
    public void onTimer(long timestamp, OnTimerContext context, Collector<FraudAlert> out) throws IOException {
        PaymentEvent payment = waitingPayment.value();
        if (payment != null) {
            out.collect(FraudAlert.of(RULE_ID, payment, "нет подтверждения за " + timeoutMs / 1000 + " секунд"));
            waitingPayment.clear();
        }
        confirmationSeen.clear();
    }
}
