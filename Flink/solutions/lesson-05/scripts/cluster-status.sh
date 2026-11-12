#!/usr/bin/env bash
# Печатает состояние кластера и всех вершин запущенных заданий через REST API JobManager.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"

curl -s "$REST/overview" | jq -r '"TaskManager: \(.taskmanagers)  слоты: \(.["slots-total"] - .["slots-available"]) заняты из \(.["slots-total"])  версия: \(.["flink-version"])"'

for job_id in $(curl -s "$REST/jobs" | jq -r '.jobs[] | select(.status == "RUNNING") | .id'); do
  curl -s "$REST/jobs/$job_id" | jq -r '"\nЗадание \(.name) [\(.state)] \(.jid)", (.vertices[] | "  \(.parallelism)x  \(.status)  \(.name)")'
done
