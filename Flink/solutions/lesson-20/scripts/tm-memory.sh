#!/usr/bin/env bash
# Показывает в мебибайтах, на какие области Flink разбил память TaskManager.
set -euo pipefail
REST="${FLINK_REST:-http://localhost:8081}"

tm_id=$(curl -s "$REST/taskmanagers" | jq -r '.taskmanagers[0].id')
curl -s "$REST/taskmanagers/$tm_id" | jq '.memoryConfiguration | map_values(. / 1048576 | floor)'
