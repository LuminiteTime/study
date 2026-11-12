#!/usr/bin/env bash
# Отправляет собранный jar в кластер в фоновом режиме. Параметры передаются заданию как есть.
set -euo pipefail
docker compose exec -T jobmanager flink run --detached /jobs/payguard-1.0.0.jar "$@"
