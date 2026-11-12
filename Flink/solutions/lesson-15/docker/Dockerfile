# Образ Flink с коннекторами для SQL. Для обычного DataStream-задания они не нужны: там всё лежит в jar.
FROM flink:2.2.1-java17

ARG MAVEN=https://repo1.maven.org/maven2

ADD --chown=flink:flink $MAVEN/org/apache/flink/flink-sql-connector-kafka/5.0.0-2.2/flink-sql-connector-kafka-5.0.0-2.2.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/org/apache/flink/flink-connector-jdbc-core/4.1.0-2.2/flink-connector-jdbc-core-4.1.0-2.2.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/org/apache/flink/flink-connector-jdbc-postgres/4.1.0-2.2/flink-connector-jdbc-postgres-4.1.0-2.2.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/org/postgresql/postgresql/42.7.14/postgresql-42.7.14.jar /opt/flink/lib/
# Обязательные зависимости JDBC-коннектора 4.x: они не входят в его jar, а без них SQL падает с ClassNotFoundException.
ADD --chown=flink:flink $MAVEN/io/openlineage/openlineage-java/1.32.0/openlineage-java-1.32.0.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/io/openlineage/openlineage-sql-java/1.32.0/openlineage-sql-java-1.32.0.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/org/apache/flink/flink-sql-connector-postgres-cdc/3.7.0-2.2/flink-sql-connector-postgres-cdc-3.7.0-2.2.jar /opt/flink/lib/
ADD --chown=flink:flink $MAVEN/org/apache/paimon/paimon-flink-2.2/2.1.0/paimon-flink-2.2-2.1.0.jar /opt/flink/lib/
# Paimon обращается к классам Hadoop даже для локальных файлов.
ADD --chown=flink:flink $MAVEN/org/apache/flink/flink-shaded-hadoop-2-uber/2.8.3-10.0/flink-shaded-hadoop-2-uber-2.8.3-10.0.jar /opt/flink/lib/
