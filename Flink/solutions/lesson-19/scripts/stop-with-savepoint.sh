#!/usr/bin/env bash
# Останавливает задание, сняв savepoint, и печатает путь к нему. Этот путь нужен для запуска новой версии.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"

job_id=$(curl -s "$REST/jobs" | jq -r '[.jobs[] | select(.status == "RUNNING")][0].id')
if [ "$job_id" = "null" ]; then
  echo "Нет запущенных заданий" >&2
  exit 1
fi

docker compose exec -T jobmanager flink stop --type canonical "$job_id" \
  | grep -oE 'file:[^ ]+savepoint-[^ ]+' | sed 's/\.$//'
