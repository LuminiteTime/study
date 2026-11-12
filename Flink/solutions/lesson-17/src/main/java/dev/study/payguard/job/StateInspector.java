package dev.study.payguard.job;

import dev.study.payguard.model.CardProfile;
import dev.study.payguard.pipeline.CardProfileFunction;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.apache.flink.api.common.RuntimeExecutionMode;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.api.common.state.ValueState;
import org.apache.flink.api.common.state.ValueStateDescriptor;
import org.apache.flink.runtime.state.hashmap.HashMapStateBackend;
import org.apache.flink.state.api.OperatorIdentifier;
import org.apache.flink.state.api.SavepointReader;
import org.apache.flink.state.api.functions.KeyedStateReaderFunction;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.util.CloseableIterator;
import org.apache.flink.util.Collector;
import org.apache.flink.util.ParameterTool;

/** Читает профили карт прямо из savepoint и печатает самые активные. Задание для этого запускать не нужно. */
public final class StateInspector {

    private static final int TOP_SIZE = 5;

    /** Строка отчёта: карта и её профиль. */
    public record CardRow(String cardId, CardProfile profile) {
    }

    public static void main(String[] args) throws Exception {
        String savepointPath = ParameterTool.fromArgs(args).getRequired("savepoint");

        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();
        env.setRuntimeMode(RuntimeExecutionMode.BATCH);
        SavepointReader savepoint = SavepointReader.read(env, savepointPath, new HashMapStateBackend());

        List<CardRow> rows = new ArrayList<>();
        try (CloseableIterator<CardRow> results = savepoint
                .readKeyedState(OperatorIdentifier.forUid(CardProfileFunction.UID), new ProfileReader())
                .executeAndCollect()) {
            results.forEachRemaining(rows::add);
        }

        System.out.println("Карт в состоянии: " + rows.size());
        rows.stream()
                .sorted(Comparator.comparingLong((CardRow row) -> row.profile().paymentCount()).reversed())
                .limit(TOP_SIZE)
                .forEach(System.out::println);
    }

    private static final class ProfileReader extends KeyedStateReaderFunction<String, CardRow> {

        private transient ValueState<CardProfile> profile;

        @Override
        public void open(OpenContext context) {
            profile = getRuntimeContext().getState(
                    new ValueStateDescriptor<>(CardProfileFunction.STATE_NAME, CardProfile.class));
        }

        @Override
        public void readKey(String cardId, Context context, Collector<CardRow> out) throws IOException {
            out.collect(new CardRow(cardId, profile.value()));
        }
    }

    private StateInspector() {
    }
}
