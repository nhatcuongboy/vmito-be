#!/bin/bash
set -e

# Server Migration Script - Step 1: Backup Data on Old Server
# Run this on the OLD server (139.180.145.154)

OLD_SERVER_IP="139.180.145.154"
BACKUP_DIR="/opt/badminton/migration_backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== Badminton Server Migration - Data Backup ==="
echo "Old Server: $OLD_SERVER_IP"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
echo "[1/5] Creating backup directory..."
mkdir -p $BACKUP_DIR

# Backup production database
echo "[2/5] Backing up production database..."
docker compose -f /opt/badminton/docker-compose.yml exec -T db \
  pg_dump -U badminton badminton > $BACKUP_DIR/production_backup_$TIMESTAMP.sql

if [ $? -eq 0 ]; then
  echo "✓ Production database backed up successfully"
else
  echo "✗ Production database backup failed!"
  exit 1
fi

# Backup staging database
echo "[3/5] Backing up staging database..."
docker compose -f /opt/badminton/docker-compose.staging.yml exec -T db-staging \
  pg_dump -U badminton badminton_staging > $BACKUP_DIR/staging_backup_$TIMESTAMP.sql

if [ $? -eq 0 ]; then
  echo "✓ Staging database backed up successfully"
else
  echo "✗ Staging database backup failed!"
  exit 1
fi

# Create configuration archive
echo "[4/5] Creating configuration archive..."
cd /opt/badminton
tar -czf $BACKUP_DIR/config_$TIMESTAMP.tar.gz \
  .env \
  .env.staging \
  docker-compose.yml \
  docker-compose.staging.yml \
  nginx/nginx.conf

if [ $? -eq 0 ]; then
  echo "✓ Configuration files archived successfully"
else
  echo "✗ Configuration archive failed!"
  exit 1
fi

# Compress all backups
echo "[5/5] Compressing all backups..."
cd $BACKUP_DIR
tar -czf badminton_migration_$TIMESTAMP.tar.gz \
  production_backup_$TIMESTAMP.sql \
  staging_backup_$TIMESTAMP.sql \
  config_$TIMESTAMP.tar.gz

if [ $? -eq 0 ]; then
  echo "✓ All backups compressed successfully"
  # Clean up individual files
  rm production_backup_$TIMESTAMP.sql staging_backup_$TIMESTAMP.sql config_$TIMESTAMP.tar.gz
else
  echo "✗ Compression failed!"
  exit 1
fi

echo ""
echo "=== Backup Complete ==="
echo ""
echo "Backup file: $BACKUP_DIR/badminton_migration_$TIMESTAMP.tar.gz"
ls -lh $BACKUP_DIR/badminton_migration_$TIMESTAMP.tar.gz
echo ""
echo "Next steps:"
echo "1. Transfer this file to the new server:"
echo "   scp $BACKUP_DIR/badminton_migration_$TIMESTAMP.tar.gz root@45.76.176.24:/opt/badminton/"
echo ""
echo "2. Run the restore script on the new server"
