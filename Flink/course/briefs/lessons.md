# Планы уроков

Общие правила в `_style.md`, настоящие выводы команд в `measurements.md` и `runs/lesson-NN.txt`. Снапшоты в `solutions/lesson-NN`. Разница между уроками `diff -ru solutions/lesson-(N-1) solutions/lesson-N --exclude=build --exclude=.gradle --exclude=data`.

Рядом с темой указано, что обязательно подтвердить исходниками. Точные файлы и номера строк находи сам в клонах, пути ниже подсказка, а не гарантия.

## 2. Как устроен кластер и как проходит запуск задания (id lesson-02, slug 02-architecture, часть Основы)
Теория. Роли: клиент, JobManager (Dispatcher, ResourceManager, JobMaster), TaskManager, слоты и slot sharing. Путь программы: StreamGraph, JobGraph, ExecutionGraph, развёртывание подзадач. Цепочки операторов (operator chaining) кратко. Режимы деплоя Application и Session (per-job удалён). Сравнение с Driver и Executor Spark. Анимация потока сообщений flow-animation (`flow-l02`), от `flink run` до RUNNING. Этот урок содержит также групповой чат (chat-l02) с участниками клиент, Dispatcher, JobMaster, ResourceManager, TaskManager о запуске задания: чат обязателен на курс один раз. Интерактивный планировщик слотов: `viz/02.js`, ползунки TaskManager, слотов, parallelism, показывает, как подзадачи ложатся в слоты и когда задание не запускается из-за нехватки слотов.
Исходники: `Dispatcher.submitJob`, `JobMaster`, `StreamingJobGraphGenerator` (склейка цепочек, `isChainable`), `DefaultExecutionGraphBuilder`.
Практика. uid и name операторов (зачем важны заранее), `env.getExecutionPlan()`, скрипт `scripts/submit.sh`, Web UI, CLI (`flink list`, `flink cancel`), REST. Вывод из `runs/lesson-02.txt`.
Задание: `scripts/cluster-status.sh` через REST и jq.

## 3. DataStream и грязные данные (lesson-03, 03-datastream-dlq, Основы)
Теория. Модель DataStream, типы трансформаций, почему `GENERIC_TYPES=false`, система типов Flink: POJO, record, Kryo как ловушка, сериализаторы. Side output и DLQ (dead letter queue): почему битая запись не должна ронять задание. Сравнение с Dataset и Encoders в Spark. Метафора своя.
Исходники: `PojoTypeInfo` или `TypeExtractor` (когда срабатывает generic), `Output`/`OutputTag`, проверка `genericTypes` в `ExecutionConfig`/`SerializerConfigImpl`.
Практика. `RejectedRecord`, `ParsePaymentFunction`, `JobConfig`, `KafkaSinks.atLeastOnceJson`, тестовые зависимости Gradle показать diff, harness-тесты.
Задание: `PaymentValidator` (проверка суммы, валюты, полей) и его тест.

## 4. Партиционирование, цепочки и сетевой стек (lesson-04, 04-partitioning-network, Основы)
Теория. keyBy, key groups, формула `keyGroup = murmurHash(key.hashCode()) % maxParallelism`, индекс подзадачи `keyGroup * parallelism / maxParallelism` (формулы разобрать на примере). rebalance, rescale, forward, broadcast. Цепочки операторов и когда они рвутся. Сетевой стек: ResultPartition, InputGate, буферы, credit-based flow control, откуда берётся backpressure. Перекос ключей. Сравнение с shuffle в Spark (файлы против непрерывной передачи). Интерактив `viz/04.js`: выбираешь тип партиционирования и parallelism, видишь распределение записей по подзадачам, с горячим ключом.
Исходники: `KeyGroupRangeAssignment`, `RebalancePartitioner`, `CreditBasedPartitionRequestClientHandler` или `RemoteInputChannel` (кредиты).
Практика. `MerchantTotal`, keyBy+reduce, смотрим перекос по метрикам из `runs/lesson-04.txt`.
Задание: `KeyDistribution` (считает раскладку ключей на подзадачи через `KeyGroupRangeAssignment`, показывает перекос).

## 5. Время события и watermark (lesson-05, 05-event-time-watermarks, Время и состояние)
Теория. Event time и processing time, опаздывающие события, watermark как утверждение «событий старше T больше не ждём», `forBoundedOutOfOrderness`, минимум по входам, idle-источники и зависшее время. Партиционные watermark в источнике (почему разбор записи делаем внутри schema). Сравнение с `withWatermark` Spark. Интерактив `viz/05.js`: симулятор watermark, пользователь двигает опоздание и задержку, видит, какие события считаются поздними, с несколькими партициями.
Исходники: `BoundedOutOfOrdernessWatermarks`, `WatermarkStrategy.withIdleness`, `StatusWatermarkValve`.
Практика. `ParsedRecord`, `ParsedRecordSchema`, `SplitParsedRecords`, `PaymentWatermarks`, чтение watermark в REST и UI.
Задание: `LatenessProbe` (counter и histogram опозданий).

## 6. Окна (lesson-06, 06-windows, Время и состояние)
Теория. Tumbling, sliding, session, global. Assigner, trigger, evictor, функция окна. Почему AggregateFunction экономнее ProcessWindowFunction. allowedLateness, side output поздних данных. Как окно живёт в состоянии, число окон на запись у sliding. Интерактив `viz/06.js`: лента событий и переключатель типа окна. Сравнение с `window()` Spark.
Исходники: `TumblingEventTimeWindows.assignWindows`, `WindowOperator.processElement`, `EventTimeTrigger`, `isWindowLate`.
Практика. `MerchantStats`, `PaymentTotals`, `MerchantStatsWindow`, `testing/Payments`, MiniCluster-тест.
Задание: `CardSessionWindow` (session gap 30 с), топик card.sessions.

## 7. Состояние с ключом, таймеры и TTL (lesson-07, 07-keyed-state-timers, Время и состояние)
Теория. Keyed state (`ValueState`, `MapState`, `ListState`, `ReducingState`), где оно лежит, таймеры, `KeyedProcessFunction`, TTL. Кардинальность ключей как причина роста состояния. Бакеты вместо хранения каждого события. Сравнение с `mapGroupsWithState`. Метафора своя.
Исходники: `StateTtlConfig`, `InternalTimerServiceImpl`, `HeapValueState` или `RocksDBValueState`, `KeyedProcessOperator`.
Практика. `FraudAlert`, `DeduplicateFunction`, `BucketedSum`, `VelocityRule`, тесты с `ProcessFunctionTestHarnesses`, `--burst`.
Задание: `AmountSpikeRule`.

## 8. Правила без перезапуска (lesson-08, 08-broadcast-rules, Время и состояние)
Теория. Broadcast state, почему обновление детерминировано на всех подзадачах, чтение из обработки записи только read-only, двухвходовые операторы и минимум watermark, почему поток правил с `noWatermarks` задержит весь оператор. Исправление через `RuleWatermarks.neverHoldBack`. Сравнение с broadcast variable.
Исходники: `KeyedBroadcastProcessFunction`, `CoBroadcastWithKeyedOperator`, `BroadcastState`.
Практика. `RuleConfig`, `DynamicRules`, `LenientJsonSchema`, `RuleWatermarks`, отправка правила `{"velocityMaxPayments":1000,"blockedCountries":["PL"]}` консольным продюсером и результат 539 алертов. Обязательно рассказать ошибку `RuleConfig ... is not serializable`: harness её не ловит, реальная отправка ловит.
Задание: правило blockedCountries.

## 9. Async I/O и соединение потоков (lesson-09, 09-async-joins, Время и состояние)
Теория. Почему синхронный вызов базы в операторе убивает пропускную способность. AsyncDataStream, capacity, timeout, ordered и unordered, связь с чекпоинтом (незавершённые запросы лежат в состоянии). Кэш. Формула пропускной способности: параллелизм умножить на capacity разделить на задержку запроса. Interval join, временные границы и состояние. KeyedCoProcessFunction как ручной join. Сравнение с stream-stream join в Spark.
Исходники: `AsyncWaitOperator` (`capacity`, очередь, `snapshotState`), `IntervalJoinOperator`.
Практика. Postgres в Compose, `sql/init.sql`, `MerchantDirectory`, `JdbcMerchantDirectory`, `AlertEnrichment`, `PaymentConfirmation`, `ConfirmedPayment`, `PaymentConfirmationJoin`, `ConfirmationMaker`. Зависимости Gradle показать.
Задание: `UnconfirmedPaymentFunction` (алерт, если подтверждение не пришло).

## 10. Сложные шаблоны на CEP (lesson-10, 10-cep, Время и состояние)
Теория. CEP, шаблон, NFA, стратегии смежности (`next`, `followedBy`, `followedByAny`), `within`, состояние и его рост, сравнение ручной реализации и CEP. MATCH_RECOGNIZE упомянуть. Метафора своя.
Исходники: `Pattern`, `NFA.process` или `NFACompiler`, `CepOperator`.
Практика. `flink-cep`, `FraudPatterns.cardTesting`, `--card-testing`, разбор найденной ошибки: случайная страна давала 869 ложных срабатываний impossible-travel, отсюда `homeCountry`.
Задание: `impossibleTravel` с `IterativeCondition`.

## 11. Чекпоинты изнутри (lesson-11, 11-checkpoints, Отказоустойчивость)
Теория. Алгоритм Chandy-Lamport в варианте Flink (asynchronous barrier snapshotting), барьеры, alignment, почему выравнивание нужно для exactly-once, unaligned-чекпоинты, что лежит в чекпоинте, state backends (HashMap, RocksDB, ForSt) и инкрементальность, стратегии перезапуска, восстановление. Анимация барьеров `viz/11.js` (пошаговая: два входа, барьер пришёл раньше на одном канале, данные за барьером ждут). Сравнение с checkpoint location в Spark.
Исходники: `CheckpointCoordinator.triggerCheckpoint`, `SingleCheckpointBarrierHandler`, `ExponentialDelayRestartBackoffTimeStrategy`, RocksDB инкрементальный снапшот.
Практика. Compose с RocksDB, инкрементальными чекпоинтами, exponential-delay, `restart: unless-stopped`, `committedOffsets(LATEST)`, скрипт `chaos-kill-tm.sh`. Цифры из `measurements.md`.
Задание: `scripts/checkpoint-report.sh`.

## 12. Exactly-once до конца (lesson-12, 12-exactly-once, Отказоустойчивость)
Теория. At-least-once, exactly-once, end-to-end. Двухфазная фиксация в приёмнике Flink (`SupportsCommitter`, предкоммит на чекпоинте и коммит после завершения). Транзакции Kafka, `read_committed`, `transactional.id`, `transaction.timeout.ms` и его связь с простоем. Цена в задержке, равная интервалу чекпоинта. Идемпотентность как альтернатива (upsert, детерминированный id). Group chat уже есть в уроке 2, здесь flow-animation с фазами `flow-l12`.
Исходники: `KafkaWriter`, `KafkaCommitter`, `TwoPhaseCommittingSink` или `SupportsCommitter`, `CommitterOperator`.
Практика. `KafkaSinks.exactlyOnceJson`, `verify-no-duplicates.sh`, два убийства TaskManager, сравнение read_committed и read_uncommitted (290 и 0 повторов против 301 и 8, против 32075 и 1848 в at-least-once).
Задание: `JdbcSinks.merchantStats` с `ON CONFLICT`, зависимости `flink-connector-jdbc-core` и `-postgres`.

## 13. Savepoint, эволюция схемы и rescale (lesson-13, 13-savepoints, Отказоустойчивость)
Теория. Чекпоинт и savepoint, формат canonical и native, `stop` против `cancel`, почему нужны `uid`, `--allowNonRestoredState`, эволюция схемы (POJO и record, что можно и нельзя), key groups и rescale, max parallelism нельзя менять. Интерактив `viz/13.js`: key groups распределяются при смене parallelism. Сравнение с Spark, где смена шаффлов ломает состояние.
Исходники: `Checkpoints.loadAndValidateCheckpoint` (проверка неиспользованного состояния), `StateAssignmentOperation`, `KeyGroupRangeAssignment.computeOperatorIndexForKeyGroup`, `PojoSerializerSnapshot` или `RecordSerializer` (эволюция).
Практика. `CardProfile` v1 показать через inline pre: `public record CardProfile(long paymentCount, long totalAmountMinor)`. Далее `CardProfileFunction`, `stop-with-savepoint.sh`, запуск v2 с полем `lastCountry` из savepoint v1, запуск с `-p 4`. Весь сценарий из `measurements.md`. Вывод `StateInspector` (карт 4873, топ-5).
Задание: `StateInspector` на State Processor API. Обязательно рассказать ошибку `executeAndCollect(Integer.MAX_VALUE)`.

## 14. Flink SQL (lesson-14, 14-sql, SQL и интеграции)
Теория. Dynamic tables, changelog и виды записей (+I, -U, +U, -D), append и upsert, оконные TVF, план задания и оператор Local/Global aggregate, состояние в SQL и `table.exec.state.ttl`, mini-batch, почему коннекторы в SQL кладутся в lib. Сравнение со Spark SQL. Интерактив или анимация: поток превращается в таблицу.
Исходники: `StreamExecWindowAggregate` или `SlicingWindowOperator`, `ChangelogMode`/`RowKind`, `TableConfigOptions`/`ExecutionConfigOptions` (`table.exec.state.ttl`, `table.exec.mini-batch.*`).
Практика. Ошибки из `measurements.md`: ClassNotFoundException openlineage, конфликт `NoSuchMethodError committedOffsets` при совместном lib. Отдельный кластер, профиль Compose `sql`, `docker/Dockerfile`, `sql/merchant_revenue.sql`, запуск `sql-client.sh -f`. Снапшот `solutions/lesson-14`, команда `docker compose --profile sql up -d --wait`.
Задание: `src/main/resources/sql/risk_revenue.sql` (Top-N и lookup join) и `SqlJobRunner`.

## 15. CDC и lakehouse (lesson-15, 15-cdc-lakehouse, SQL и интеграции)
Теория. Что такое CDC, WAL и логические слоты PostgreSQL, snapshot плюс чтение журнала, `REPLICA IDENTITY FULL`, опасность забытого слота (раздувает WAL). Upsert-kafka и compacted-топики. Lakehouse, Paimon: первичный ключ, бакеты, снимки, LSM. Iceberg тоже доступен (iceberg-flink-runtime-2.2, Iceberg 1.12.0), в проекте выбран Paimon из-за первичного ключа и потоковых обновлений. Пакетное чтение той же таблицы.
Исходники: CDC: `PostgresValueValidator` (ошибка REPLICA IDENTITY), `PostgresSourceBuilder`. Flink: `upsert` в `UpsertKafkaDynamicTableFactory` (в kafka-репозитории).
Практика. `wal_level=logical`, `cdc_merchants.sql`, `paimon_alerts.sql`, ошибка Hadoop, ошибка REPLICA IDENTITY, UPDATE и результат.
Задание: `sql/paimon_report.sql`.

## 16. Тестирование (lesson-16, 16-testing, Прод)
Теория. Пирамида тестов Flink: функции через harness, топология без запуска, MiniCluster, E2E в контейнерах, restore-тесты. Что каждый уровень ловит (ошибка RuleConfig не ловится harness и ловится топологией). CI.
Исходники: `AbstractStreamOperatorTestHarness.snapshot`/`initializeState`, `MiniClusterExtension`, `StreamGraph`/`StreamNode.getTransformationUID`.
Практика. `buildPipeline` + `createEnvironment` (diff PayGuardJob), `DbSettings`, `PipelineTopologyTest`, `CardProfileRestoreTest`, `PayGuardE2ETest`, задача `e2eTest` в Gradle, `.github/workflows/ci.yml`. Обязательно история расследования commons-lang3 из `measurements.md`, как пример диагностики. Результат: 45 обычных тестов, E2E за 7 с, GitHub Actions файл не запускался, так и сказать.
Задание: `DeduplicateRestoreTest`.

## 17. Мониторинг (lesson-17, 17-monitoring, Прод)
Теория. Система метрик Flink, области (scope), Prometheus Reporter и превращение типов (Counter в Gauge, Histogram в Summary), что смотреть: лаг, отставание по времени события, busy, backpressured, чекпоинты, рестарты, GC, почему нельзя алертить только на лаг. RED/USE. Свои метрики.
Исходники: `PrometheusReporter` (преобразование), `MetricGroup.addGroup`, `ScopeFormats`.
Практика. `AlertMetrics`, блок Compose, `monitoring/prometheus.yml`, `alerts.yml`, provisioning Grafana, `payguard.json`, сценарии из `measurements.md`. Адреса: Prometheus 9090, Grafana 3000.
Задание: правило `PayGuardKafkaLagHigh` и панель лага (в `solutions/lesson-17/monitoring`).

## 18. Производительность (lesson-18, 18-performance, Прод)
Теория. Backpressure как симптом, как искать источник (идти вниз до первого busy=1000), busyTimeMsPerSecond, backPressuredTimeMsPerSecond, flame graph, unaligned против debloat, object reuse, сериализация как частая причина. Перекос и двухфазная агрегация. Интерактив `viz/18.js`: граф из операторов, ползунок скорости узкого оператора, показывает busy/back вверх по потоку.
Исходники: `TaskIOMetricGroup` (busy/backpressured), `BufferDebloater`, `AlignedCheckpointTimeout` или `execution.checkpointing.aligned-checkpoint-timeout`.
Практика. `SlowDown`, `--slow-ms 20`, `scripts/vertex-load.sh`, таблицы и цифры из `measurements.md`, REST `/backpressure`, flame graph.
Задание: `SaltedMerchantStats`, `--stats-salts 16`, цифры.

## 19. Память и большое состояние (lesson-19, 19-memory-state, Прод)
Теория. Модель памяти TaskManager, формулы областей (managed = fraction × Total Flink, network = fraction с границами). JVM Overhead, Metaspace. Куда идёт RocksDB. Блочный кэш, memtable, компакции. Настройки. ForSt и State V2, асинхронный доступ. Capacity planning с формулой. Интерактивный калькулятор `viz/19.js` (ввод process.size и долей, вывод областей и предупреждение при конфликте, значения по умолчанию сверить с `TaskManagerOptions`).
Исходники: `TaskExecutorProcessUtils`, `TaskManagerOptions` (значения по умолчанию), `RocksDBMemoryConfiguration`, `ForStStateBackend`.
Практика. Блок Compose, `scripts/tm-memory.sh`, метрики RocksDB, `sql/merchant_revenue_forst.sql`, конфликты памяти из `measurements.md`.
Задание: оценить размер состояния и память на 5000 платежей в секунду и 5 млн карт. В ответе расчёт с допущениями (нет кода).

## 20. Kubernetes (lesson-20, 20-kubernetes, Прод)
Теория. Режимы развёртывания (application, session) и почему в проде application. Flink Kubernetes Operator как контроллер: CRD `FlinkDeployment`, цикл reconcile (желаемое состояние в spec, фактическое в status), `lifecycleState` (DEPLOYED, STABLE, UPGRADING). Режимы апгрейда `stateless`, `last-state`, `savepoint` и что каждый делает с состоянием. `FlinkStateSnapshot` как ресурс для savepoint. HA на Kubernetes: выбор лидера и метаданные в ConfigMap, `high-availability.storageDir` на общем томе, почему JobManager после рестарта берёт тот же jobId и последний чекпоинт. Сравнение со Spark on k8s (spark-operator, driver pod) двумя отдельными фразами. Состояние внешних систем: Kafka без тома теряет `__transaction_state`, и это ломает exactly-once (подробный разбор в уроке 21, здесь коротко как причина PVC). Интерактив `viz/20.js` по желанию: цикл reconcile при patch parallelism (spec → savepoint → новый JobManager → restored).
Исходники (клон `operator:`): reconciler задания (`ApplicationReconciler`/`AbstractJobReconciler`, ветки по `UpgradeMode`), `FlinkDeploymentSpec`/`JobSpec` (поля `upgradeMode`, `parallelism`), lifecycle (`ResourceLifecycleState`). Клон `flink:` модуль `flink-kubernetes`, `KubernetesLeaderElectionHaServices` или `KubernetesHaServicesFactory`, `HighAvailabilityOptions` (storageDir). Документация оператора на `https://nightlies.apache.org/flink/flink-kubernetes-operator-docs-release-1.16/docs/...` (проверь curl) и раздел Flink `deployment/ha/kubernetes_ha/`.
Практика. `scripts/k8s-up.sh` целиком (minikube, helm оператора 1.16.1 с `webhook.create=false` и `--timeout 15m`, секрет, configmap, образ, `minikube image load`). `docker/job.Dockerfile`. `k8s/infra.yaml` (Kafka с PVC и `strategy: Recreate`, kafka-init, Postgres, PVC flink-data), `k8s/payguard.yaml` (разбор каждого блока flinkConfiguration, podTemplate с секретом и томом, ресурсы, job), `k8s/loadgen.yaml`. Команды `kubectl get flinkdep`, port-forward `svc/payguard-rest 18081:8081`, REST. Проверка HA удалением пода JobManager (34 с, тот же jobId). Рестарт пода Kafka с томом (задание не упало). Все ловушки из measurements с лечением: память существующего профиля minikube, helm timeout, slf4j в loadgen, пропавший образ после пересоздания minikube, инцидент InvalidPidMapping как причина PVC.
Задание: изменить parallelism 2→3 без потери состояния. Ответ: `kubectl patch flinkdep payguard --type merge -p '{"spec":{"job":{"parallelism":3}}}'`, наблюдение за lifecycleState, `kubectl get flinkstatesnapshots`, проверка `latest.restored.external_path` и parallelism вершин, цифры из measurements (52 с, 2 TM, 4 слота, один failed чекпоинт сразу после деплоя и его причина). Файлов кода в ответе нет, только команды и вывод. Autoscaler не проверялся, упомянуть как следующий шаг с ссылкой на доку оператора.

## 21. Эксплуатация и финал (lesson-21, 21-operations, Прод)
Теория. Разбор реального инцидента из measurements как постмортем: Kafka без тома, потеря `__transaction_state`, `InvalidPidMappingException` при коммите, бесконечные рестарты, почему KafkaCommitter не считает ошибку восстановимой, как лечили (PV, удаление flinkdep и HA ConfigMap, запуск без состояния) и какую цену это имело (потеря позиции и состояния). Хаос-тестирование как привычка. Безопасность Kafka (SASL, в проде SASL_SSL, секреты из окружения). Выпуск образа в CI. Проверка совместимости перед обновлением Flink и коннекторов (на главной странице курса обещано разобрать, почему мы на 2.2.1 при вышедшем 2.3.0: матрица версий коннектора, savepoint-совместимость, release notes). Итог курса, что делать дальше.
Исходники: `kafka:` `KafkaCommitter` (ветки обработки ошибок коммита, где `InvalidPidMappingException` попадает в неизвестные), `FlinkKafkaInternalProducer` или место, где выставляется transactional.id. `flink:` restart strategy (`ExponentialDelayRestartBackoffTimeStrategy`). Документация: `ops/upgrading/`, `connectors/datastream/kafka/` (раздел про exactly-once и transaction timeout), `deployment/security/`.
Практика. diff 20→21: `KafkaSecurity.java` целиком и правки KafkaSinks, PayGuardJob, LoadGenerator. `docker-compose.sasl.yml`, `.env.example`. `.github/workflows/release.yml`. `scripts/final-chaos.sh` и его вывод из measurements. Что проверено вживую, а что нет, говорить ровно по measurements (release.yml не запускался).
Задание: написать runbook на алерты урока 17 и чек-лист production readiness для PayGuard. Ответ: `ops/runbook.md` и `ops/production-readiness.md` через data-code с объяснением, почему каждый пункт там есть (ссылки на уроки, где пункт проверялся).
