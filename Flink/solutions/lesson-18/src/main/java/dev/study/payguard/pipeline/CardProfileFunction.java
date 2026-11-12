package dev.study.payguard.pipeline;

import dev.study.payguard.model.CardProfile;
import dev.study.payguard.model.PaymentEvent;
import java.io.IOException;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.streaming.api.functions.KeyedProcessFunction;
import org.apache.flink.util.Collector;

/** Ведёт профиль каждой карты. На выход отдаёт профиль после обновления. */
public class CardProfileFunction extends KeyedProcessFunction<String, PaymentEvent, CardProfile> {

    public static final String UID = "card-profile";
    public static final String STATE_NAME = "profile";

    private transient ValueState<CardProfile> profile;

    @Override
    public void open(OpenContext context) {
        profile = getRuntimeContext().getState(new ValueStateDescriptor<>(STATE_NAME, CardProfile.class));
    }

    @Override
    public void processElement(PaymentEvent payment, Context context, Collector<CardProfile> out) throws IOException {
        CardProfile current = profile.value();
        CardProfile updated = (current == null ? CardProfile.EMPTY : current).plus(payment);
        profile.update(updated);
        out.collect(updated);
    }
}
