#!/usr/bin/env bash
# Показывает статистику чекпоинтов запущенного задания: счётчики и последние завершённые снимки.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"

job_id=$(curl -s "$REST/jobs" | jq -r '[.jobs[] | select(.status == "RUNNING")][0].id')
if [ "$job_id" = "null" ]; then
  echo "Нет запущенных заданий" >&2
  exit 1
fi

curl -s "$REST/jobs/$job_id/checkpoints" | jq -r '
  "Завершено: \(.counts.completed)  неудачных: \(.counts.failed)  восстановлений: \(.counts.restored)",
  (.history[:5][] | "#\(.id) \(.status)  \(.end_to_end_duration) мс  записано \(.checkpointed_size / 1024 | floor) КиБ  состояние \(.state_size / 1024 | floor) КиБ")'
