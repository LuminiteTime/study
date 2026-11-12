package dev.study.payguard.job;

/** Подключение к PostgreSQL. На кластере берётся из переменных окружения, в тесте из системных свойств той же JVM. */
public record DbSettings(String url, String user, String password) {

    public static DbSettings resolve() {
        return new DbSettings(read("PAYGUARD_DB_URL"), read("PAYGUARD_DB_USER"), read("PAYGUARD_DB_PASSWORD"));
    }

    private static String read(String name) {
        String fromEnvironment = System.getenv(name);
        return fromEnvironment != null ? fromEnvironment : System.getProperty(name);
    }
}
