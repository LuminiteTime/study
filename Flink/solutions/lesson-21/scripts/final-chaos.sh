#!/usr/bin/env bash
# Итоговый тест: валит компоненты стенда по очереди и сверяет отсутствие дублей в fraud.alerts.
# Падение JobManager проверяется в Kubernetes (урок 20): в этом стенде нет HA, и задание пропало бы вместе с ним.
set -euo pipefail
PAUSE="${PAUSE:-45}"

step() {
  echo
  echo "== $1"
  shift
  "$@"
  sleep "$PAUSE"
  ./scripts/checkpoint-report.sh | head -1
}

step "Убиваем TaskManager" ./scripts/chaos-kill-tm.sh
step "Останавливаем PostgreSQL на 30 секунд" sh -c 'docker compose stop postgres > /dev/null; sleep 30; docker compose start postgres > /dev/null'
step "Перезапускаем Kafka" docker compose restart kafka

echo
./scripts/verify-no-duplicates.sh fraud.alerts alertId read_committed
