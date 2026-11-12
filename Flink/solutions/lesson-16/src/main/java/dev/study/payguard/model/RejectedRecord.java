package dev.study.payguard.model;

/** Запись, которую не удалось принять: исходный текст и причина отказа для разбора в DLQ. */
public record RejectedRecord(String raw, String reason, long rejectedAtMs) {
}
