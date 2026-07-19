#!/usr/bin/env sh
set -eu

: "${COS_OBJECT_URL:?COS_OBJECT_URL is required, for example cos://bucket/pxxis-backups/pxxis-postgres-20260717T000000Z.dump}"

coscli_bin=${COSCLI_BIN:-coscli}
compose_file=${COMPOSE_FILE:-docker-compose.yml}
work_dir=$(mktemp -d)
container_name="pxxis-backup-verify-$$"
archive_path="${work_dir}/backup.dump"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT INT TERM

record_restore_metric() {
  [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ] || return 1
  metric_id="restore-${container_name}-$$"
  metric_window=$(date -u +%Y-%m-%dT%H:00:00Z)
  docker compose -f "$compose_file" exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
      INSERT INTO \"SecurityMetric\" (\"id\", \"metricKey\", \"windowStartedAt\", \"occurrenceCount\", \"valueTotal\", \"lastValue\", \"createdAt\", \"updatedAt\")
      VALUES ('$metric_id', 'restore_verifications', '$metric_window'::timestamp, 1, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (\"metricKey\", \"windowStartedAt\") DO UPDATE
      SET \"occurrenceCount\" = \"SecurityMetric\".\"occurrenceCount\" + 1,
          \"valueTotal\" = \"SecurityMetric\".\"valueTotal\" + 1,
          \"lastValue\" = 1,
          \"updatedAt\" = CURRENT_TIMESTAMP;
    " >/dev/null
}

"$coscli_bin" cp "$COS_OBJECT_URL" "$archive_path"
"$coscli_bin" cp "${COS_OBJECT_URL}.sha256" "${archive_path}.sha256"
(cd "$work_dir" && sha256sum -c "$(basename "${archive_path}.sha256")")

docker run -d --rm --name "$container_name" \
  -e POSTGRES_USER=backup_verify \
  -e POSTGRES_PASSWORD=backup_verify_only \
  -e POSTGRES_DB=backup_verify \
  postgres:16-alpine >/dev/null

attempt=0
until docker exec "$container_name" pg_isready -U backup_verify -d backup_verify >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || { echo "Temporary PostgreSQL did not become ready" >&2; exit 1; }
  sleep 1
done

docker cp "$archive_path" "${container_name}:/tmp/backup.dump"
docker exec "$container_name" pg_restore -U backup_verify -d backup_verify --clean --if-exists --no-owner --no-privileges /tmp/backup.dump
table_count=$(docker exec "$container_name" psql -U backup_verify -d backup_verify -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")
migration_count=$(docker exec "$container_name" psql -U backup_verify -d backup_verify -Atc "SELECT count(*) FROM \"_prisma_migrations\"")

[ "$table_count" -gt 0 ] || { echo "Restore verification found no public tables" >&2; exit 1; }
[ "$migration_count" -gt 0 ] || { echo "Restore verification found no Prisma migrations" >&2; exit 1; }
record_restore_metric || printf '%s\n' 'Restore verification passed, but SecurityMetric recording was skipped.' >&2
printf 'Restore verification passed: %s tables, %s Prisma migrations.\n' "$table_count" "$migration_count"
