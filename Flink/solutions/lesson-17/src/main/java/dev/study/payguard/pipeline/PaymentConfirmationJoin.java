package dev.study.payguard.pipeline;

import dev.study.payguard.model.ConfirmedPayment;
import dev.study.payguard.model.PaymentConfirmation;
import dev.study.payguard.model.PaymentEvent;
import java.time.Duration;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.functions.co.ProcessJoinFunction;
import org.apache.flink.util.Collector;

/** Соединяет платёж с подтверждением, пришедшим в течение пяти минут после него. */
public final class PaymentConfirmationJoin {

    public static final Duration MAX_DELAY = Duration.ofMinutes(5);

    public static SingleOutputStreamOperator<ConfirmedPayment> attach(
            DataStream<PaymentEvent> payments, DataStream<PaymentConfirmation> confirmations) {
        return payments.keyBy(PaymentEvent::paymentId)
                .intervalJoin(confirmations.keyBy(PaymentConfirmation::paymentId))
                .between(Duration.ZERO, MAX_DELAY)
                .process(new ToConfirmedPayment())
                .name("join-confirmations")
                .uid("join-confirmations");
    }

    private static final class ToConfirmedPayment
            extends ProcessJoinFunction<PaymentEvent, PaymentConfirmation, ConfirmedPayment> {

        @Override
        public void processElement(
                PaymentEvent payment, PaymentConfirmation confirmation, Context context, Collector<ConfirmedPayment> out) {
            out.collect(new ConfirmedPayment(
                    payment.paymentId(),
                    payment.merchantId(),
                    payment.amountMinor(),
                    confirmation.status(),
                    confirmation.eventTimeMs() - payment.eventTimeMs()));
        }
    }

    private PaymentConfirmationJoin() {
    }
}
