package dev.study.payguard.job;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.apache.flink.table.api.EnvironmentSettings;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.util.ParameterTool;

/** Запускает SQL-скрипт из ресурсов jar. Так SQL-задание проходит ту же сборку и тот же релиз, что и код. */
public final class SqlJobRunner {

    public static void main(String[] args) throws IOException {
        String script = ParameterTool.fromArgs(args).getRequired("script");
        TableEnvironment tableEnv = TableEnvironment.create(EnvironmentSettings.inStreamingMode());
        for (String statement : readResource(script).split(";\\s*\\n")) {
            if (!withoutComments(statement).isBlank()) {
                tableEnv.executeSql(statement);
            }
        }
    }

    private static String readResource(String name) throws IOException {
        try (InputStream stream = SqlJobRunner.class.getResourceAsStream("/sql/" + name)) {
            if (stream == null) {
                throw new IllegalArgumentException("В jar нет скрипта sql/" + name);
            }
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String withoutComments(String statement) {
        return statement.replaceAll("(?m)^--.*$", "");
    }

    private SqlJobRunner() {
    }
}
