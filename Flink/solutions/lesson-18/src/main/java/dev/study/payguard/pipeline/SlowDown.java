package dev.study.payguard.pipeline;

import org.apache.flink.api.common.functions.MapFunction;

/** Учебный тормоз: имитирует медленную запись во внешнюю систему, чтобы вызвать backpressure. */
public class SlowDown<T> implements MapFunction<T, T> {

    private final long delayMs;

    public SlowDown(long delayMs) {
        this.delayMs = delayMs;
    }

    @Override
    public T map(T value) throws InterruptedException {
        if (delayMs > 0) {
            Thread.sleep(delayMs);
        }
        return value;
    }
}
