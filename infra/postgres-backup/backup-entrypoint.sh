#!/bin/sh

set -eu

BACKUP_DIRECTORY="${BACKUP_DIRECTORY:-/backups}"
BACKUP_INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_MAX_AGE_SECONDS="${BACKUP_MAX_AGE_SECONDS:-93600}"
export BACKUP_DIRECTORY BACKUP_INTERVAL_SECONDS BACKUP_RETENTION_DAYS
export BACKUP_MAX_AGE_SECONDS

export PGHOST="${PGHOST:-postgres}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${POSTGRES_USER:-system112}"
export PGPASSWORD="${POSTGRES_PASSWORD:-system112}"
POSTGRES_DB="${POSTGRES_DB:-system112_training}"
export POSTGRES_DB
LOCK_DIRECTORY="$BACKUP_DIRECTORY/.system112-backup.lock"
lock_held="false"
active_partial=""
verify_database=""

fail() {
  echo "backup: $*" >&2
  exit 1
}

require_positive_integer() {
  name="$1"
  value="$2"

  case "$value" in
    ''|*[!0-9]*) fail "$name must be a positive integer" ;;
  esac

  [ "$value" -gt 0 ] || fail "$name must be greater than zero"
}

validate_configuration() {
  require_positive_integer BACKUP_INTERVAL_SECONDS "$BACKUP_INTERVAL_SECONDS"
  require_positive_integer BACKUP_RETENTION_DAYS "$BACKUP_RETENTION_DAYS"
  require_positive_integer BACKUP_MAX_AGE_SECONDS "$BACKUP_MAX_AGE_SECONDS"
  mkdir -p "$BACKUP_DIRECTORY"
  [ -w "$BACKUP_DIRECTORY" ] || fail "$BACKUP_DIRECTORY is not writable"
}

cleanup_operation() {
  if [ -n "$active_partial" ]; then
    rm -f -- "$active_partial"
    active_partial=""
  fi
  if [ -n "$verify_database" ]; then
    dropdb --if-exists --force "$verify_database" >/dev/null 2>&1 || true
    verify_database=""
  fi
  if [ "$lock_held" = "true" ]; then
    rmdir "$LOCK_DIRECTORY" >/dev/null 2>&1 || true
    lock_held="false"
  fi
}

acquire_lock() {
  mkdir "$LOCK_DIRECTORY" 2>/dev/null || fail \
    "another backup or restore operation is already running"
  lock_held="true"
  trap cleanup_operation EXIT HUP INT TERM
}

release_lock() {
  cleanup_operation
  trap - EXIT HUP INT TERM
}

archive_path() {
  archive_name="$1"

  case "$archive_name" in
    ''|.*|*/*|*\\*|*[!A-Za-z0-9._-]*)
      fail "archive must be a file name inside $BACKUP_DIRECTORY"
      ;;
    system112-*.dump) ;;
    *) fail "archive name must match system112-*.dump" ;;
  esac

  printf '%s/%s\n' "$BACKUP_DIRECTORY" "$archive_name"
}

verify_archive() {
  archive="$1"
  checksum="${archive}.sha256"

  [ -f "$archive" ] || fail "archive does not exist: $(basename "$archive")"
  [ -f "$checksum" ] || fail "checksum does not exist: $(basename "$checksum")"

  (
    cd "$BACKUP_DIRECTORY"
    sha256sum -c "$(basename "$checksum")"
  )
  pg_restore --list "$archive" >/dev/null
}

prune_expired() {
  find "$BACKUP_DIRECTORY" -maxdepth 1 -type f \
    -name 'system112-*.dump' -mtime "+$BACKUP_RETENTION_DAYS" \
    -exec sh -c 'for archive do rm -f -- "$archive" "$archive.sha256"; done' sh {} +
}

run_backup() {
  validate_configuration
  acquire_lock
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  final="$BACKUP_DIRECTORY/system112-${POSTGRES_DB}-${timestamp}.dump"
  partial="${final}.partial"
  active_partial="$partial"
  [ ! -e "$final" ] || fail "backup already exists: $(basename "$final")"

  umask 077
  rm -f -- "$partial"

  echo "backup: creating $(basename "$final")"
  pg_dump \
    --format=custom \
    --compress=gzip:6 \
    --no-owner \
    --no-privileges \
    --file="$partial" \
    "$POSTGRES_DB"

  pg_restore --list "$partial" >/dev/null
  mv "$partial" "$final"
  active_partial=""
  (
    cd "$BACKUP_DIRECTORY"
    sha256sum "$(basename "$final")" >"$(basename "$final").sha256"
  )
  prune_expired
  echo "backup: completed $(basename "$final")"
  release_lock
}

run_restore() {
  validate_configuration
  [ "$#" -eq 1 ] || fail "usage: restore <system112-*.dump>"
  archive="$(archive_path "$1")"

  [ "${RESTORE_CONFIRM_DATABASE:-}" = "$POSTGRES_DB" ] || fail \
    "set RESTORE_CONFIRM_DATABASE=$POSTGRES_DB to confirm destructive restore"

  acquire_lock
  verify_archive "$archive"
  echo "backup: restoring $(basename "$archive") into $POSTGRES_DB"
  pg_restore \
    --clean \
    --if-exists \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-privileges \
    --dbname="$POSTGRES_DB" \
    "$archive"
  echo "backup: restore completed"
  release_lock
}

run_restore_drill() {
  validate_configuration
  [ "$#" -eq 1 ] || fail "usage: verify <system112-*.dump>"
  archive="$(archive_path "$1")"
  acquire_lock
  verify_archive "$archive"

  suffix="$(date -u +%Y%m%d%H%M%S)-$$"
  verify_database="system112_restore_verify_${suffix}"

  createdb --template=template0 "$verify_database"
  pg_restore \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-privileges \
    --dbname="$verify_database" \
    "$archive"

  table_count="$(
    psql --dbname="$verify_database" --tuples-only --no-align \
      --command="select count(*) from pg_catalog.pg_tables where schemaname not in ('pg_catalog', 'information_schema');"
  )"
  case "$table_count" in
    ''|*[!0-9]*) fail "restore drill returned an invalid table count" ;;
  esac
  [ "$table_count" -gt 0 ] || fail "restore drill produced an empty database"

  echo "backup: restore drill passed with $table_count application tables"
  release_lock
}

run_status() {
  validate_configuration
  latest="$(ls -1t "$BACKUP_DIRECTORY"/system112-*.dump 2>/dev/null | head -n 1 || true)"
  [ -n "$latest" ] || fail "there is no completed backup"
  verify_archive "$latest"

  modified_at="$(date -r "$latest" +%s)"
  now="$(date +%s)"
  age="$((now - modified_at))"
  [ "$age" -le "$BACKUP_MAX_AGE_SECONDS" ] || fail \
    "latest backup is stale (${age}s > ${BACKUP_MAX_AGE_SECONDS}s)"
}

run_schedule() {
  validate_configuration
  while true; do
    # Run in a child process: its traps clean partial files and the scheduler
    # can keep its bounded retry interval after a transient database outage.
    if ! system112-backup backup; then
      echo "backup: scheduled run failed; retrying after interval" >&2
    fi
    sleep "$BACKUP_INTERVAL_SECONDS" &
    wait "$!"
  done
}

command="${1:-schedule}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$command" in
  backup) run_backup "$@" ;;
  restore) run_restore "$@" ;;
  verify) run_restore_drill "$@" ;;
  status) run_status "$@" ;;
  schedule) run_schedule "$@" ;;
  *) fail "unknown command: $command" ;;
esac
