# Образ задания: внутри официальный Flink и наш jar. Для Application Mode кластер и код выкатываются одним образом.
FROM flink:2.2.1-java17
COPY build/libs/payguard-1.0.0.jar /opt/flink/usrlib/payguard.jar
