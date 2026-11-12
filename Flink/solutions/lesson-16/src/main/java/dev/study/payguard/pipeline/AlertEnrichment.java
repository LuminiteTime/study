package dev.study.payguard.pipeline;

import dev.study.payguard.model.FraudAlert;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.apache.flink.api.common.functions.OpenContext;
import org.apache.flink.metrics.Counter;
import org.apache.flink.streaming.api.functions.async.ResultFuture;
import org.apache.flink.streaming.api.functions.async.RichAsyncFunction;
import org.apache.flink.util.function.SerializableSupplier;

/** Дополняет алерт уровнем риска продавца, не блокируя поток обработки ожиданием базы. */
public class AlertEnrichment extends RichAsyncFunction<FraudAlert, FraudAlert> {

    private static final int THREADS = 8;
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final SerializableSupplier<MerchantDirectory> directorySupplier;

    private transient MerchantDirectory directory;
    private transient ExecutorService executor;
    // Кэш без ограничения размера: продавцов тысячи, а не миллионы. На миллионах нужен Caffeine.
    private transient Map<String, CachedRisk> cache;
    private transient Counter lookupFailures;

    private record CachedRisk(String riskLevel, long expiresAtMs) {
    }

    public AlertEnrichment(SerializableSupplier<MerchantDirectory> directorySupplier) {
        this.directorySupplier = directorySupplier;
    }

    @Override
    public void open(OpenContext context) {
        directory = directorySupplier.get();
        executor = Executors.newFixedThreadPool(THREADS);
        cache = new ConcurrentHashMap<>();
        lookupFailures = getRuntimeContext().getMetricGroup().counter("merchantLookupFailures");
    }

    @Override
    public void asyncInvoke(FraudAlert alert, ResultFuture<FraudAlert> result) {
        CachedRisk cached = cache.get(alert.merchantId());
        if (cached != null && cached.expiresAtMs() > System.currentTimeMillis()) {
            result.complete(List.of(alert.withMerchantRisk(cached.riskLevel())));
            return;
        }
        CompletableFuture
                .supplyAsync(() -> lookup(alert.merchantId()), executor)
                .whenComplete((risk, error) -> result.complete(List.of(
                        alert.withMerchantRisk(error == null ? risk : onFailure()))));
    }

    @Override
    public void timeout(FraudAlert alert, ResultFuture<FraudAlert> result) {
        result.complete(List.of(alert.withMerchantRisk(onFailure())));
    }

    @Override
    public void close() throws Exception {
        if (executor != null) {
            executor.shutdownNow();
        }
        if (directory != null) {
            directory.close();
        }
    }

    private String lookup(String merchantId) {
        try {
            Optional<String> risk = directory.riskLevel(merchantId);
            String level = risk.orElse(FraudAlert.RISK_UNKNOWN);
            cache.put(merchantId, new CachedRisk(level, System.currentTimeMillis() + CACHE_TTL.toMillis()));
            return level;
        } catch (Exception e) {
            throw new IllegalStateException("Не удалось прочитать риск продавца " + merchantId, e);
        }
    }

    private String onFailure() {
        lookupFailures.inc();
        return FraudAlert.RISK_UNKNOWN;
    }
}
