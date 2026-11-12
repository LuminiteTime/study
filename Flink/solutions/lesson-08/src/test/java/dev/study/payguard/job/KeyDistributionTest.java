package dev.study.payguard.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class KeyDistributionTest {

    private static final int PARALLELISM = 4;
    private static final int MAX_PARALLELISM = 128;

    private static List<String> merchants() {
        List<String> merchants = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            merchants.add("m-%04d".formatted(i));
        }
        return merchants;
    }

    @Test
    void equalWeightsSpreadReasonablyEvenly() {
        Map<Integer, Long> load = KeyDistribution.loadBySubtask(merchants(), key -> 1L, PARALLELISM, MAX_PARALLELISM);
        assertThat(KeyDistribution.skew(load, PARALLELISM)).isLessThan(1.5);
    }

    @Test
    void hotKeyMakesOneSubtaskMuchBusier() {
        long hotWeight = 21;
        Map<Integer, Long> load = KeyDistribution.loadBySubtask(
                merchants(), key -> key.equals("m-0000") ? hotWeight * 49 : 1L, PARALLELISM, MAX_PARALLELISM);
        assertThat(KeyDistribution.skew(load, PARALLELISM)).isGreaterThan(2.0);
    }

    @Test
    void sameKeyAlwaysLandsOnSameSubtask() {
        Map<Integer, Long> first = KeyDistribution.loadBySubtask(List.of("m-0007"), key -> 1L, PARALLELISM, MAX_PARALLELISM);
        Map<Integer, Long> second = KeyDistribution.loadBySubtask(List.of("m-0007"), key -> 1L, PARALLELISM, MAX_PARALLELISM);
        assertThat(first).isEqualTo(second);
    }
}
