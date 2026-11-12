# Runbook PayGuard

Каждый раздел начинается с алерта, который привёл сюда. Первым делом проверь Web UI задания и дашборд PayGuard в Grafana.

## PayGuardJobRestarted
1. `curl -s $REST/jobs/$JOB/exceptions | jq -r '.exceptionHistory.entries[0].stacktrace' | head -40`
2. Ошибка в коде или данных (`NullPointerException`, ошибка разбора) повторится после рестарта. Задание уйдёт в цикл рестартов, поэтому такую запись надо отправлять в DLQ, а код чинить релизом.
3. Ошибка окружения (потеря TaskManager, недоступен брокер) обычно проходит сама. Проверь, что перезапуски прекратились и лаг падает.

## PayGuardCheckpointStale и PayGuardCheckpointsFailing
1. `./scripts/checkpoint-report.sh`, смотри на долю подзадач, которые не успели.
2. Есть backpressure, чекпоинты выросли с секунд до минут: идём в раздел PayGuardBackpressure. На время разбора можно включить `execution.checkpointing.unaligned.enabled`.
3. Нет backpressure: проверь хранилище чекпоинтов и его ошибки в логах TaskManager.
4. Если нет успешного чекпоинта дольше `transaction.timeout.ms`, брокер отменит транзакции и после восстановления алерты этого интервала будут потеряны. Лимит 15 минут задан в `KafkaSinks`.

## PayGuardBackpressure и PayGuardKafkaLagHigh
1. `./scripts/vertex-load.sh`. Источник проблемы это самая верхняя по потоку вершина с `busy` около 1000 ниже вершин с высоким `back`.
2. Перекос: сравни минимум и максимум входа по подзадачам.
3. Внешняя система: сравни метрики приёмника и внешнего сервиса.
4. Настоящий рост нагрузки: увеличь параллелизм через savepoint.

## PayGuardSourceSilent
TaskManager или задание не работают. Метрик лага в этот момент нет. Посмотри `kubectl get pods`, `kubectl get flinkdep`, и лаг снаружи:
`kafka-consumer-groups.sh --bootstrap-server $BOOTSTRAP --describe --group payguard`.

## Плановые операции
- Новая версия кода: обнови образ в `FlinkDeployment`, оператор сам снимет savepoint.
- Откат: верни прошлый образ. Если новая версия успела изменить схему состояния, запускай из savepoint, снятого до выката.
- Обработка заново: новый `--group-id`, старт из нужной метки времени, новый `transactional-id-prefix`, отдельный топик результата.
