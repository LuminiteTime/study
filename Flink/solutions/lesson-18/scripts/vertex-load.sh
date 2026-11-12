#!/usr/bin/env bash
# Для каждой вершины задания печатает занятость, долю ожидания следующего оператора и разброс записей по подзадачам.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"

job_id=$(curl -s "$REST/jobs" | jq -r '[.jobs[] | select(.status == "RUNNING")][0].id')
if [ "$job_id" = "null" ]; then
  echo "Нет запущенных заданий" >&2
  exit 1
fi

printf '%-46s %6s %6s %12s %12s\n' "вершина" "busy" "back" "вход мин" "вход макс"
curl -s "$REST/jobs/$job_id" | jq -r '.vertices[] | "\(.id) \(.name)"' | while read -r id name; do
  metrics=$(curl -s "$REST/jobs/$job_id/vertices/$id/subtasks/metrics?get=busyTimeMsPerSecond,backPressuredTimeMsPerSecond,numRecordsIn")
  read -r busy back min max < <(echo "$metrics" | jq -r '
    (map({(.id): .}) | add) as $m
    | "\($m.busyTimeMsPerSecond.max // 0) \($m.backPressuredTimeMsPerSecond.max // 0) \($m.numRecordsIn.min // 0) \($m.numRecordsIn.max // 0)"')
  printf '%-46.46s %6.0f %6.0f %12.0f %12.0f\n' "$name" "$busy" "$back" "$min" "$max"
done
