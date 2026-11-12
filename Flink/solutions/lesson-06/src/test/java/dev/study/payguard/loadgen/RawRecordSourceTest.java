package dev.study.payguard.loadgen;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Random;
import org.junit.jupiter.api.Test;

class RawRecordSourceTest {

    private static final long NOW = 1_700_000_000_000L;

    private static RawRecordSource sourceWith(double duplicateShare, double badShare) {
        Random random = new Random(42);
        return new RawRecordSource(new PaymentFactory(random, 0.0), random, duplicateShare, badShare);
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
    void shareOutsideRangeIsRejected() {
        String[] args = {"--dup", "1.5"};
        assertThatThrownBy(() -> GeneratorConfig.fromArgs(args))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("--dup");
    }
}
