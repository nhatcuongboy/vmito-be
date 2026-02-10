#!/bin/bash
set -e

# Server Migration Script - Step 2: Restore Data on New Server
# Run this on the NEW server (45.76.176.24)

NEW_SERVER_IP="45.76.176.24"
RESTORE_DIR="/opt/badminton"

echo "=== Badminton Server Migration - Data Restoration ==="
echo "New Server: $NEW_SERVER_IP"
echo ""

# Check if backup file exists
if [ ! -f $RESTORE_DIR/badminton_migration_*.tar.gz ]; then
  echo "✗ Error: No migration backup file found in $RESTORE_DIR"
  echo "Please transfer the backup file from the old server first:"
  echo "  scp root@139.180.145.154:/opt/badminton/migration_backups/badminton_migration_*.tar.gz $RESTORE_DIR/"
  exit 1
fi

# Extract backup
echo "[1/7] Extracting backup archive..."
cd $RESTORE_DIR
BACKUP_FILE=$(ls badminton_migration_*.tar.gz | head -n 1)
tar -xzf $BACKUP_FILE

if [ $? -eq 0 ]; then
  echo "✓ Backup extracted successfully"
else
  echo "✗ Extraction failed!"
  exit 1
fi

# Extract configuration
echo "[2/7] Extracting configuration files..."
tar -xzf config_*.tar.gz

if [ $? -eq 0 ]; then
  echo "✓ Configuration files extracted"
else
  echo "✗ Configuration extraction failed!"
  exit 1
fi

# Create Docker network
echo "[3/7] Creating Docker network..."
if ! docker network inspect badminton-shared-net &> /dev/null; then
  docker network create badminton-shared-net
  echo "✓ Docker network created"
else
  echo "✓ Docker network already exists"
fi

# Start database containers
echo "[4/7] Starting database containers..."
docker compose up -d db
docker compose -f docker-compose.staging.yml up -d db-staging

echo "Waiting for databases to be ready..."
sleep 10

# Check database health
docker compose exec db pg_isready -U badminton
docker compose -f docker-compose.staging.yml exec db-staging pg_isready -U badminton

# Restore production database
echo "[5/7] Restoring production database..."
PROD_BACKUP=$(ls production_backup_*.sql | head -n 1)
cat $PROD_BACKUP | docker compose exec -T db psql -U badminton -d badminton

if [ $? -eq 0 ]; then
  echo "✓ Production database restored successfully"
else
  echo "✗ Production database restoration failed!"
  exit 1
fi

# Restore staging database
echo "[6/7] Restoring staging database..."
STAGING_BACKUP=$(ls staging_backup_*.sql | head -n 1)
cat $STAGING_BACKUP | docker compose -f docker-compose.staging.yml exec -T db-staging psql -U badminton -d badminton_staging

if [ $? -eq 0 ]; then
  echo "✓ Staging database restored successfully"
else
  echo "✗ Staging database restoration failed!"
  exit 1
fi

# Verify data restoration
echo "[7/7] Verifying data restoration..."
echo "Production user count:"
docker compose exec db psql -U badminton -d badminton -t -c "SELECT COUNT(*) FROM \"User\";"

echo "Staging user count:"
docker compose -f docker-compose.staging.yml exec db-staging psql -U badminton -d badminton_staging -t -c "SELECT COUNT(*) FROM \"User\";"

echo ""
echo "=== Restoration Complete ==="
echo ""
echo "Next steps:"
echo "1. Start all services:"
echo "   docker compose up -d"
echo "   docker compose -f docker-compose.staging.yml up -d"
echo ""
echo "2. Generate SSL certificates (after DNS is updated):"
echo "   ./scripts/migrate-ssl.sh"
echo ""
echo "3. Verify applications are running:"
echo "   docker compose ps"
echo "   docker compose -f docker-compose.staging.yml ps"
