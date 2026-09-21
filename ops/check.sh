#!/bin/sh

set -eu

sh -n \
  ops/postgres-backup/backup-entrypoint.sh \
  ops/tls/generate-self-signed.sh
docker compose --profile app --profile ops config --quiet
