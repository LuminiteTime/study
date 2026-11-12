#!/usr/bin/env bash
# Поднимает учебный стенд в minikube: кластер Kubernetes, оператор Flink, инфраструктуру и образ задания.
set -euo pipefail
OPERATOR_VERSION=1.16.1

# Размер памяти применяется только при создании кластера. Старый профиль сначала удаляют: minikube delete.
minikube start --cpus=6 --memory=9g --driver=docker
helm repo add flink-operator "https://downloads.apache.org/flink/flink-kubernetes-operator-$OPERATOR_VERSION/"
helm upgrade --install flink-kubernetes-operator flink-operator/flink-kubernetes-operator \
  --version "$OPERATOR_VERSION" --set webhook.create=false --wait --timeout 15m

kubectl create secret generic payguard-db --from-literal=password=payguard --dry-run=client -o yaml | kubectl apply -f -
kubectl create configmap payguard-sql --from-file=sql/init.sql --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f k8s/infra.yaml

./gradlew shadowJar --console=plain -q
docker build -f docker/job.Dockerfile -t payguard-job:1.0.0 .
minikube image load payguard-job:1.0.0
