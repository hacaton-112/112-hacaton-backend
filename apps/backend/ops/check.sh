#!/bin/sh

set -eu

sh -n \
  ../../infra/postgres-backup/backup-entrypoint.sh \
  ../../infra/tls/generate-self-signed.sh
docker compose -f ../../docker-compose.yml --profile app --profile ops config --quiet
