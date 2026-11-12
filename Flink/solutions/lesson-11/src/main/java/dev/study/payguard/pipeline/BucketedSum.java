package dev.study.payguard.pipeline;

import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import org.apache.flink.api.common.state.MapState;

/** Сумма за скользящий интервал, разбитая на корзины: хранит несколько чисел вместо всех событий. */
final class BucketedSum {

    private final MapState<Long, Long> buckets;
    private final long bucketMs;

    BucketedSum(MapState<Long, Long> buckets, Duration bucketSize) {
        this.buckets = buckets;
        this.bucketMs = bucketSize.toMillis();
    }

    void add(long eventTimeMs, long value) throws Exception {
        long bucket = bucketStart(eventTimeMs);
        Long current = buckets.get(bucket);
        buckets.put(bucket, (current == null ? 0 : current) + value);
    }

    long sumSince(long fromMs) throws Exception {
        long sum = 0;
        for (Map.Entry<Long, Long> entry : buckets.entries()) {
            if (entry.getKey() + bucketMs > fromMs) {
                sum += entry.getValue();
            }
        }
        return sum;
    }

    void evictBefore(long fromMs) throws Exception {
        Iterator<Long> keys = buckets.keys().iterator();
        while (keys.hasNext()) {
            if (keys.next() + bucketMs <= fromMs) {
                keys.remove();
            }
        }
    }

    long bucketEnd(long eventTimeMs) {
        return bucketStart(eventTimeMs) + bucketMs;
    }

    private long bucketStart(long eventTimeMs) {
        return eventTimeMs - eventTimeMs % bucketMs;
    }
}
