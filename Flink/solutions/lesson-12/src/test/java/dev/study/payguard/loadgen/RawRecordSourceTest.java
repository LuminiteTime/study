package dev.study.payguard.loadgen;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Random;
import org.junit.jupiter.api.Test;

class RawRecordSourceTest {

    private static final long NOW = 1_700_000_000_000L;

    private static RawRecordSource sourceWith(double duplicateShare, double badShare) {
        Random random = new Random(42);
        GeneratorConfig config = GeneratorConfig.fromArgs(new String[] {
                "--dup", String.valueOf(duplicateShare), "--bad", String.valueOf(badShare)});
        return new RawRecordSource(new PaymentFactory(random, 0.0), random, config);
    }

    @Test
    void withoutDirtEveryRecordIsUnique() {
        RawRecordSource source = sourceWith(0.0, 0.0);
        assertThat(source.next(NOW)).isNotEqualTo(source.next(NOW));
    }

    @Test
    void duplicateShareOfOneRepeatsPreviousRecord() {
        RawRecordSource source = sourceWith(1.0, 0.0);
        String first = source.next(NOW);
        assertThat(source.next(NOW)).isEqualTo(first);
    }

    @Test
    void badShareOfOneProducesOnlyBrokenRecords() {
        RawRecordSource source = sourceWith(0.0, 1.0);
        assertThat(source.next(NOW)).isEqualTo(RawRecordSource.BAD_RECORD);
    }

    @Test
    void cardTestingAttackEndsWithLargePayment() throws Exception {
        Random random = new Random(42);
        GeneratorConfig config = GeneratorConfig.fromArgs(new String[] {"--card-testing", "1.0"});
        RawRecordSource source = new RawRecordSource(new PaymentFactory(random, 0.0), random, config);
        com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();

        long[] amounts = new long[6];
        for (int i = 0; i < amounts.length; i++) {
            amounts[i] = mapper.readTree(source.next(NOW)).get("amountMinor").asLong();
        }

        assertThat(amounts[0]).isLessThan(500);
        assertThat(amounts[5]).isGreaterThan(30_000);
    }

    @Test
    void shareOutsideRangeIsRejected() {
        String[] args = {"--dup", "1.5"};
        assertThatThrownBy(() -> GeneratorConfig.fromArgs(args))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("--dup");
    }
}
