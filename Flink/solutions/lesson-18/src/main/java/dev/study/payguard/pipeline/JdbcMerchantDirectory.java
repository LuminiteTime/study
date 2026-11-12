package dev.study.payguard.pipeline;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import dev.study.payguard.job.DbSettings;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Optional;

/** Читает уровень риска из PostgreSQL через пул соединений. Настройки подключения описаны в DbSettings. */
public final class JdbcMerchantDirectory implements MerchantDirectory {

    private static final String QUERY = "SELECT risk_level FROM merchants WHERE merchant_id = ?";

    private final HikariDataSource dataSource;

    private JdbcMerchantDirectory(HikariDataSource dataSource) {
        this.dataSource = dataSource;
    }

    public static JdbcMerchantDirectory fromEnvironment(int poolSize) {
        DbSettings db = DbSettings.resolve();
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(db.url());
        config.setUsername(db.user());
        config.setPassword(db.password());
        config.setMaximumPoolSize(poolSize);
        config.setReadOnly(true);
        return new JdbcMerchantDirectory(new HikariDataSource(config));
    }

    @Override
    public Optional<String> riskLevel(String merchantId) throws SQLException {
        try (Connection connection = dataSource.getConnection();
                PreparedStatement statement = connection.prepareStatement(QUERY)) {
            statement.setString(1, merchantId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? Optional.of(result.getString(1)) : Optional.empty();
            }
        }
    }

    @Override
    public void close() {
        dataSource.close();
    }
}
