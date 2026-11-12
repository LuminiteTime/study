FLINK_IMAGE ?= flink:latest
FLINK_NETWORK ?= flink-network
FLINK_CONF ?= $(CURDIR)/flink-conf.yaml
FLINK_CONF_PATH ?= /opt/flink/conf/flink-conf.yaml

.PHONY: network start-jobmanager start-taskmanager start stop-jobmanager stop-taskmanager stop remove-jobmanager remove-taskmanager remove

network:
	docker network inspect $(FLINK_NETWORK) >/dev/null 2>&1 || docker network create $(FLINK_NETWORK)

start-jobmanager: network
	docker run -d --name jobmanager --network $(FLINK_NETWORK) -p 8081:8081 -v "$(FLINK_CONF):$(FLINK_CONF_PATH):ro" $(FLINK_IMAGE) jobmanager

start-taskmanager: network
	docker run -d --name taskmanager --network $(FLINK_NETWORK) -v "$(FLINK_CONF):$(FLINK_CONF_PATH):ro" $(FLINK_IMAGE) taskmanager

start: start-jobmanager start-taskmanager

stop-jobmanager:
	docker stop jobmanager || true

stop-taskmanager:
	docker stop taskmanager || true

stop: stop-jobmanager stop-taskmanager

remove-jobmanager:
	docker rm -f jobmanager || true

remove-taskmanager:
	docker rm -f taskmanager || true

remove: remove-jobmanager remove-taskmanager
