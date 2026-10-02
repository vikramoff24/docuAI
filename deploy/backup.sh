#!/usr/bin/env bash
# Nightly backup of the database and uploaded files into deploy/backups/, keeping 7 days.
# cron (as the deploy user):  15 3 * * *  /home/ubuntu/docuAI/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
compose() { docker compose --env-file .env.production -f docker-compose.prod.yml "$@"; }

dir="deploy/backups"; stamp=$(date -u +%Y%m%d-%H%M%S)
mkdir -p "$dir"
compose exec -T postgres pg_dump -U docuflow -d docuflow --format=custom > "$dir/db-$stamp.dump"
compose exec -T storage sh -c 'tar -C /data -cf - .' | gzip > "$dir/files-$stamp.tar.gz"
find "$dir" -type f -mtime +7 -delete
echo "Backup written: $dir/*-$stamp.*  (copy them off this machine regularly)"
