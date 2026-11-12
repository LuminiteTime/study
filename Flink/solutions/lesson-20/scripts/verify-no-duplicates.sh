#!/usr/bin/env bash
# Читает топик как потребитель с заданным уровнем изоляции и считает идентификаторы, встретившиеся дважды.
# Использование: verify-no-duplicates.sh <топик> <поле-идентификатор> [read_committed|read_uncommitted]
set -euo pipefail
TOPIC="$1"
ID_FIELD="$2"
ISOLATION="${3:-read_committed}"

records=$(docker compose exec -T kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic "$TOPIC" \
  --from-beginning \
  --isolation-level "$ISOLATION" \
  --timeout-ms 10000 2>/dev/null | jq -r --arg field "$ID_FIELD" '.[$field]')

total=$(printf '%s\n' "$records" | grep -c . || true)
duplicates=$(printf '%s\n' "$records" | sort | uniq -d | grep -c . || true)
echo "$TOPIC [$ISOLATION]: записей $total, идентификаторов с повтором $duplicates"
