package dev.study.payguard.loadgen;

import java.util.HashMap;
import java.util.Map;

/** Настройки генератора. Каждая доля задаётся числом от 0 до 1. */
record GeneratorConfig(
        String bootstrapServers,
        String topic,
        int ratePerSecond,
        double lateShare,
        double duplicateShare,
        double badShare,
        double burstShare) {

    static GeneratorConfig fromArgs(String[] args) {
        Map<String, String> options = parseOptions(args);
        return new GeneratorConfig(
                options.getOrDefault("bootstrap", "localhost:9094"),
                options.getOrDefault("topic", "payments.raw"),
                Integer.parseInt(options.getOrDefault("rate", "100")),
                share(options, "late", 0.05),
                share(options, "dup", 0.0),
                share(options, "bad", 0.0),
                share(options, "burst", 0.0));
    }

    private static Map<String, String> parseOptions(String[] args) {
        if (args.length % 2 != 0) {
            throw new IllegalArgumentException("Ожидаются пары --имя значение");
        }
        Map<String, String> options = new HashMap<>();
        for (int i = 0; i < args.length; i += 2) {
            if (!args[i].startsWith("--")) {
                throw new IllegalArgumentException("Опция должна начинаться с --: " + args[i]);
            }
            options.put(args[i].substring(2), args[i + 1]);
        }
        return options;
    }

    private static double share(Map<String, String> options, String name, double defaultValue) {
        double value = options.containsKey(name) ? Double.parseDouble(options.get(name)) : defaultValue;
        if (value < 0 || value > 1) {
            throw new IllegalArgumentException("--" + name + " должно быть от 0 до 1, получено " + value);
        }
        return value;
    }
}
