# Server Migration Guide: 139.180.145.154 → 45.76.176.24

Complete guide for migrating the Badminton application to a new server.

## Quick Reference

**Old Server:** 139.180.145.154  
**New Server:** 45.76.176.24

## Migration Scripts

Three helper scripts have been created to simplify the migration process:

1. **`migrate-backup.sh`** - Run on OLD server to backup all data
2. **`migrate-restore.sh`** - Run on NEW server to restore data
3. **`migrate-ssl.sh`** - Run on NEW server to generate SSL certificates

## Step-by-Step Migration Process

### Phase 1: Preparation (24-48 hours before)

#### 1.1 Reduce DNS TTL

Login to your DNS provider and reduce TTL to 300 seconds for:

- `vmito.com`
- `www.vmito.com`
- `staging.vmito.com`

**Wait 24 hours** for old TTL to expire.

#### 1.2 Setup New Server

```bash
# From your local machine
scp scripts/server-setup.sh root@45.76.176.24:/tmp/
ssh root@45.76.176.24 "chmod +x /tmp/server-setup.sh && /tmp/server-setup.sh"
```

### Phase 2: Data Backup (On OLD Server)

```bash
# SSH to old server
ssh root@139.180.145.154

# Copy backup script
# (Upload migrate-backup.sh to old server first)
chmod +x /opt/badminton/scripts/migrate-backup.sh

# Run backup
cd /opt/badminton
./scripts/migrate-backup.sh
```

This creates: `/opt/badminton/migration_backups/badminton_migration_TIMESTAMP.tar.gz`

### Phase 3: Transfer Data

```bash
# From old server to new server
scp /opt/badminton/migration_backups/badminton_migration_*.tar.gz root@45.76.176.24:/opt/badminton/
```

### Phase 4: Restore Data (On NEW Server)

```bash
# SSH to new server
ssh root@45.76.176.24

# Copy restore script
# (Upload migrate-restore.sh to new server first)
chmod +x /opt/badminton/scripts/migrate-restore.sh

# Run restore
cd /opt/badminton
./scripts/migrate-restore.sh
```

### Phase 5: Deploy Applications

```bash
# On new server
cd /opt/badminton

# Pull latest images
docker compose pull
docker compose -f docker-compose.staging.yml pull

# Start all services
docker compose up -d
docker compose -f docker-compose.staging.yml up -d

# Check status
docker compose ps
docker compose -f docker-compose.staging.yml ps
```

### Phase 6: Update DNS

Update A records in your DNS provider:

| Record  | Type | Value        | TTL  |
| ------- | ---- | ------------ | ---- |
| @       | A    | 45.76.176.24 | 3600 |
| www     | A    | 45.76.176.24 | 3600 |
| staging | A    | 45.76.176.24 | 3600 |

**Wait 5-30 minutes** for DNS propagation.

### Phase 7: Generate SSL Certificates

```bash
# On new server
cd /opt/badminton

# Update email in migrate-ssl.sh first
nano scripts/migrate-ssl.sh
# Change: EMAIL="your-email@example.com"

chmod +x scripts/migrate-ssl.sh
./scripts/migrate-ssl.sh
```

### Phase 8: Update CI/CD

Update GitHub Secrets in both repositories:

**badminton-backend:**

- Settings → Secrets and variables → Actions
- Update `SERVER_HOST`: `45.76.176.24`

**badminton-frontend:**

- Settings → Secrets and variables → Actions
- Update `SERVER_HOST`: `45.76.176.24`

### Phase 9: Verification

#### Test Production

```bash
# Check HTTPS
curl -I https://vmito.com

# Check API
curl https://vmito.com/api/health

# Browser test
# Open https://vmito.com
# - Login
# - Create session
# - Join session
```

#### Test Staging

```bash
# Check HTTPS
curl -I https://staging.vmito.com

# Check API
curl https://staging.vmito.com/api/health

# Browser test
# Open https://staging.vmito.com
```

#### Monitor Logs

```bash
# Production logs
docker compose logs -f --tail=100

# Staging logs
docker compose -f docker-compose.staging.yml logs -f --tail=100
```

## Rollback Plan

If issues occur, revert DNS to old server:

1. Update DNS A records back to `139.180.145.154`
2. Wait 5-10 minutes for propagation
3. Old server should still be running

## Post-Migration (After 7 Days)

### Decommission Old Server

```bash
# On old server
ssh root@139.180.145.154
cd /opt/badminton

# Stop all services
docker compose down
docker compose -f docker-compose.staging.yml down

# Optional: Remove volumes
docker volume prune
```

### Restore DNS TTL

Change TTL back to 3600 or higher for all records.

## Troubleshooting

### Database Connection Errors

```bash
# Check database is running
docker compose ps db
docker compose -f docker-compose.staging.yml ps db-staging

# Check logs
docker compose logs db
```

### SSL Certificate Issues

```bash
# Check certificate files exist
ls -la /opt/badminton/data/certbot/conf/live/

# Regenerate if needed
./scripts/migrate-ssl.sh
```

### Application Not Starting

```bash
# Check all containers
docker compose ps

# View specific service logs
docker compose logs backend
docker compose logs frontend
```

## Support

For detailed information, see:

- Full migration plan: `implementation_plan.md` (in artifacts)
- Setup guide: `docs/SETUP-GUIDE.md`
- Staging setup: `docs/STAGING_SETUP.md`

---

**Migration Date:** ******\_******  
**Completed By:** ******\_******
