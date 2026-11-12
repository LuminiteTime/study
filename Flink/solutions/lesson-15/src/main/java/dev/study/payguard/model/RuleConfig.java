package dev.study.payguard.model;

import java.io.Serializable;
import java.util.List;

/** Настройки правил, которые аналитик меняет на лету сообщением в топик rules.config. */
public record RuleConfig(int velocityMaxPayments, List<String> blockedCountries) implements Serializable {
}
