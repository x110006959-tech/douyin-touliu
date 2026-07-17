#!/usr/bin/env sh
set -eu

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${COS_PREFIX:?COS_PREFIX is required, for example cos://bucket/pxxis-backups}"

compose_file=${COMPOSE_FILE:-docker-compose.yml}
coscli_bin=${COSCLI_BIN:-coscli}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_name="pxxis-postgres-${timestamp}.dump"
backup_dir=${BACKUP_DIR:-./.backups}
backup_path="${backup_dir}/${backup_name}"

umask 077
mkdir -p "$backup_dir"
trap 'rm -f "$backup_path" "${backup_path}.sha256"' EXIT INT TERM

docker compose -f "$compose_file" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" --format=custom --no-owner --no-privileges "$POSTGRES_DB" > "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"

"$coscli_bin" cp "$backup_path" "${COS_PREFIX%/}/${backup_name}"
"$coscli_bin" cp "${backup_path}.sha256" "${COS_PREFIX%/}/${backup_name}.sha256"

printf 'Uploaded and checksum-verified locally: %s\n' "${COS_PREFIX%/}/${backup_name}"
