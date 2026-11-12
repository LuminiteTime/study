#!/usr/bin/env bash
# Убивает TaskManager без предупреждения, ждёт восстановления задания и печатает, сколько оно заняло.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"
TIMEOUT_SECONDS=180

job_id=$(curl -s "$REST/jobs" | jq -r '[.jobs[] | select(.status == "RUNNING")][0].id')
if [ "$job_id" = "null" ]; then
  echo "Нет запущенных заданий" >&2
  exit 1
fi
restored_before=$(curl -s "$REST/jobs/$job_id/checkpoints" | jq '.counts.restored')

echo "Убиваю TaskManager"
docker compose kill -s SIGKILL taskmanager
started=$(date +%s)
sleep 2
docker compose up -d taskmanager

while true; do
  restored=$(curl -s "$REST/jobs/$job_id/checkpoints" | jq '.counts.restored')
  running=$(curl -s "$REST/jobs/$job_id" | jq '[.vertices[] | select(.status == "RUNNING")] | length')
  total=$(curl -s "$REST/jobs/$job_id" | jq '.vertices | length')
  if [ "$restored" -gt "$restored_before" ] && [ "$running" -eq "$total" ]; then
    echo "Задание восстановлено из чекпоинта за $(( $(date +%s) - started )) с"
    exit 0
  fi
  if [ $(( $(date +%s) - started )) -gt "$TIMEOUT_SECONDS" ]; then
    echo "Задание не восстановилось за $TIMEOUT_SECONDS с" >&2
    exit 1
  fi
  sleep 2
done
