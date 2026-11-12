package dev.study.payguard.pipeline;

import java.util.Optional;

/** Справочник продавцов. Отдельный тип нужен, чтобы тест подставил медленную или падающую реализацию. */
public interface MerchantDirectory extends AutoCloseable {

    Optional<String> riskLevel(String merchantId) throws Exception;
}
