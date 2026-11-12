package dev.study.payguard.job;

import java.util.Map;
import java.util.TreeMap;
import java.util.function.ToLongFunction;
import org.apache.flink.runtime.state.KeyGroupRangeAssignment;

/** Считает, какую долю нагрузки получит каждая параллельная копия оператора после keyBy. */
public final class KeyDistribution {

    /** Возвращает нагрузку по номеру подзадачи для набора ключей с их весами. */
    public static <K> Map<Integer, Long> loadBySubtask(
            Iterable<K> keys, ToLongFunction<K> weight, int parallelism, int maxParallelism) {
        Map<Integer, Long> load = new TreeMap<>();
        for (K key : keys) {
            int subtask = KeyGroupRangeAssignment.assignKeyToParallelOperator(key, maxParallelism, parallelism);
            load.merge(subtask, weight.applyAsLong(key), Long::sum);
        }
        return load;
    }

    /** Отношение самой загруженной копии к средней. 1.0 значит идеально ровно. */
    public static double skew(Map<Integer, Long> load, int parallelism) {
        long total = load.values().stream().mapToLong(Long::longValue).sum();
        long max = load.values().stream().mapToLong(Long::longValue).max().orElse(0);
        double average = (double) total / parallelism;
        return average == 0 ? 0 : max / average;
    }

    private KeyDistribution() {
    }
}
