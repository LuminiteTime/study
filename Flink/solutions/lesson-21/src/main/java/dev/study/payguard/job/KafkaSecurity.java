package dev.study.payguard.job;

import java.util.Properties;
import org.apache.kafka.clients.CommonClientConfigs;
import org.apache.kafka.common.config.SaslConfigs;

/**
 * Настройки подключения к защищённой Kafka. Логин и пароль приходят из окружения и не попадают в jar,
 * но едут в графе задания вместе со свойствами источника.
 */
public final class KafkaSecurity {

    private static final String LOGIN_MODULE = "org.apache.kafka.common.security.plain.PlainLoginModule";

    public static Properties fromEnvironment() {
        Properties properties = new Properties();
        String user = System.getenv("PAYGUARD_KAFKA_USER");
        if (user == null) {
            return properties;
        }
        // ponytail: учебный стенд без TLS, в проде здесь SASL_SSL, иначе пароль уходит открытым текстом.
        properties.setProperty(CommonClientConfigs.SECURITY_PROTOCOL_CONFIG, "SASL_PLAINTEXT");
        properties.setProperty(SaslConfigs.SASL_MECHANISM, "PLAIN");
        properties.setProperty(SaslConfigs.SASL_JAAS_CONFIG, "%s required username=\"%s\" password=\"%s\";"
                .formatted(LOGIN_MODULE, user, System.getenv("PAYGUARD_KAFKA_PASSWORD")));
        return properties;
    }

    private KafkaSecurity() {
    }
}
