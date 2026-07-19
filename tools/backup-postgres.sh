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
remote_checksum_path="${backup_path}.remote.sha256"
remote_backup_path="${backup_path}.remote.dump"

umask 077
mkdir -p "$backup_dir"
trap 'rm -f "$backup_path" "${backup_path}.sha256" "$remote_checksum_path" "$remote_backup_path"' EXIT INT TERM

record_backup_metric() {
  metric_id="backup-${timestamp}-$$"
  metric_window=$(date -u +%Y-%m-%dT%H:00:00Z)
  docker compose -f "$compose_file" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
      INSERT INTO \"SecurityMetric\" (\"id\", \"metricKey\", \"windowStartedAt\", \"occurrenceCount\", \"valueTotal\", \"lastValue\", \"createdAt\", \"updatedAt\")
      VALUES ('$metric_id', 'backup_runs', '$metric_window'::timestamp, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (\"metricKey\", \"windowStartedAt\") DO UPDATE
      SET \"occurrenceCount\" = \"SecurityMetric\".\"occurrenceCount\" + 1,
          \"valueTotal\" = \"SecurityMetric\".\"valueTotal\" + 1,
          \"lastValue\" = 1,
          \"updatedAt\" = CURRENT_TIMESTAMP;
    " >/dev/null
}

docker compose -f "$compose_file" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" --format=custom --no-owner --no-privileges "$POSTGRES_DB" > "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"

"$coscli_bin" cp "$backup_path" "${COS_PREFIX%/}/${backup_name}"
"$coscli_bin" cp "${backup_path}.sha256" "${COS_PREFIX%/}/${backup_name}.sha256"
"$coscli_bin" cp "${COS_PREFIX%/}/${backup_name}.sha256" "$remote_checksum_path"
cmp -s "${backup_path}.sha256" "$remote_checksum_path"
"$coscli_bin" cp "${COS_PREFIX%/}/${backup_name}" "$remote_backup_path"
local_checksum=$(awk '{print $1}' "${backup_path}.sha256")
remote_checksum=$(sha256sum "$remote_backup_path" | awk '{print $1}')
[ "$local_checksum" = "$remote_checksum" ]
docker compose -f "$compose_file" exec -T postgres pg_restore --list < "$remote_backup_path" >/dev/null
record_backup_metric || printf '%s\n' 'Backup succeeded, but SecurityMetric recording was skipped.' >&2

printf 'Uploaded and checksum-verified remotely: %s\n' "${COS_PREFIX%/}/${backup_name}"
