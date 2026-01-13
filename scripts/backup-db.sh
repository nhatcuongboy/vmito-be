#!/bin/bash
set -e

# Database backup script
# Run daily via cron: 0 2 * * * /opt/badminton/scripts/backup-db.sh

BACKUP_DIR="/opt/badminton/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/badminton_backup_$DATE.sql"
KEEP_DAYS=7

# Create backup directory
mkdir -p $BACKUP_DIR

echo "Creating database backup: $BACKUP_FILE"

# Create backup
docker compose -f /opt/badminton/docker-compose.yml exec -T db \
    pg_dump -U badminton badminton > $BACKUP_FILE

# Compress backup
gzip $BACKUP_FILE
echo "Backup created: ${BACKUP_FILE}.gz"

# Remove old backups
echo "Removing backups older than $KEEP_DAYS days..."
find $BACKUP_DIR -name "*.sql.gz" -mtime +$KEEP_DAYS -delete

echo "Backup complete!"
ls -lh $BACKUP_DIR
