#!/usr/bin/env bash
# Creates a compressed PostgreSQL backup and prunes old files.
# Usage: ./scripts/backup-db.sh [output-dir]
# Requires: docker compose stack running (uses the `db` service).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$SCRIPT_DIR/../backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$OUT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT_DIR/teamboard-$TIMESTAMP.dump"

docker compose exec -T db pg_dump -U "${POSTGRES_USER:-teamboard}" -Fc "${POSTGRES_DB:-teamboard}" > "$FILE"
echo "Backup written to $FILE"

find "$OUT_DIR" -name 'teamboard-*.dump' -type f -mtime "+$RETENTION_DAYS" -delete
echo "Pruned backups older than $RETENTION_DAYS days."

cat <<'RESTORE'
To restore:
  docker compose exec -T db pg_restore -U <user> -d <database> --clean --if-exists < backups/<file>.dump
RESTORE
