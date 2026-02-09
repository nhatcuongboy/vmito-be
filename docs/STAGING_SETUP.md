# Staging Environment Setup Guide

This guide explains how to set up and deploy the staging environment for the Badminton application.

## Architecture Overview

The staging environment runs alongside production on the same Vultr server with complete isolation:

- **Separate containers**: All services run in dedicated staging containers
- **Separate database**: PostgreSQL instance with its own data volume
- **Separate network**: Docker network `badminton-network-staging`
- **Different ports**:
  - Frontend: 8000 (internal), 8080 or 443 (external)
  - Backend: 8001 (internal), 8080 or 443 (external)
  - Database: 5433 (host), 5432 (container)

### URL Options

**Option A: Subdomain (Recommended)**

- URL: `https://staging.vmito.com`
- Requires: DNS A record configuration
- Benefits: Clean URLs, separate SSL certificate, production-like setup

**Option B: Port-based**

- URL: `http://vmito.com:8080`
- Requires: No DNS changes
- Benefits: Simpler setup, faster deployment

---

## Initial Server Setup

### 1. DNS Configuration (Option A only)

Add an A record in your DNS provider:

```
Type: A
Name: staging
Value: 139.180.145.154
TTL: 3600
```

Wait for DNS propagation (5-30 minutes):

```bash
nslookup staging.vmito.com
```

### 2. Server Directory Setup

SSH into the server:

```bash
ssh user@139.180.145.154
```

Create staging directory (if using separate directory):

```bash
sudo mkdir -p /opt/badminton-staging
cd /opt/badminton-staging
```

Or use the same directory as production:

```bash
cd /opt/badminton
```

### 3. Upload Configuration Files

From your local machine, copy the staging configuration:

```bash
# Copy docker-compose file
scp docker-compose.staging.yml user@139.180.145.154:/opt/badminton/

# Copy nginx configuration
scp nginx/nginx.staging.conf user@139.180.145.154:/opt/badminton/nginx/

# Copy deployment script
scp scripts/deploy-staging.sh user@139.180.145.154:/opt/badminton/scripts/
```

### 4. Create Environment File

On the server, create `.env.staging`:

```bash
cd /opt/badminton
nano .env.staging
```

Copy contents from `.env.staging.example` and fill in real values:

- `POSTGRES_PASSWORD`: Strong password for staging database
- `JWT_SECRET`: Unique secret for staging (different from production)
- `GOOGLE_CLIENT_ID/SECRET`: OAuth credentials
- `CLOUDINARY_URL`: Image upload credentials
- `DOCKER_USERNAME`: Your Docker Hub username

### 5. SSL Certificate (Option A only)

Generate SSL certificate for staging subdomain:

```bash
docker compose -f docker-compose.staging.yml run --rm certbot-staging certonly \
  --webroot \
  -w /var/www/certbot \
  -d staging.vmito.com \
  --email your-email@example.com \
  --agree-tos \
  --no-eff-email
```

### 6. Initial Deployment

Pull images and start containers:

```bash
# Load staging environment
export $(cat .env.staging | xargs)

# Pull images
docker compose -f docker-compose.staging.yml pull

# Start services
docker compose -f docker-compose.staging.yml up -d

# Check status
docker compose -f docker-compose.staging.yml ps
```

### 7. Verify Deployment

Check all containers are running:

```bash
docker compose -f docker-compose.staging.yml ps
```

Expected output:

```
NAME                          STATUS
badminton-db-staging          Up (healthy)
badminton-backend-staging     Up
badminton-frontend-staging    Up
badminton-nginx-staging       Up
```

View logs:

```bash
docker compose -f docker-compose.staging.yml logs -f
```

---

## CI/CD Deployment

### GitHub Secrets Configuration

Add these secrets to both repositories (Settings → Secrets and variables → Actions):

- `DOCKER_USERNAME`: Your Docker Hub username
- `DOCKER_PASSWORD`: Your Docker Hub password/token
- `SERVER_HOST`: 139.180.145.154
- `SERVER_USER`: SSH username
- `SERVER_SSH_KEY`: Private SSH key for server access
- `CLOUDINARY_CLOUD_NAME`: (Frontend only)

### Automatic Deployment

Push to `develop` or `staging` branch:

```bash
git checkout -b develop
# Make changes
git add .
git commit -m "feat: new feature for staging"
git push origin develop
```

GitHub Actions will automatically:

1. Run tests and linting
2. Build Docker images with `staging` tag
3. Push to Docker Hub
4. SSH to server and deploy

### Manual Deployment

Trigger deployment manually from GitHub:

1. Go to Actions tab
2. Select "Build and Deploy (Staging)" workflow
3. Click "Run workflow"
4. Select branch and run

---

## Manual Deployment on Server

SSH to server and run:

```bash
cd /opt/badminton
./scripts/deploy-staging.sh
```

Or manually:

```bash
cd /opt/badminton
docker compose -f docker-compose.staging.yml pull
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.staging.yml up -d
docker image prune -f
```

---

## Environment Variables Reference

### Backend (.env.staging)

| Variable               | Description       | Example                         |
| ---------------------- | ----------------- | ------------------------------- |
| `POSTGRES_PASSWORD`    | Database password | `staging_secure_pass_123`       |
| `POSTGRES_DB`          | Database name     | `badminton_staging`             |
| `JWT_SECRET`           | JWT signing key   | `staging-jwt-secret-xyz`        |
| `FRONTEND_URL`         | Frontend URL      | `https://staging.vmito.com`     |
| `BACKEND_URL`          | Backend API URL   | `https://staging.vmito.com/api` |
| `WS_URL`               | WebSocket URL     | `wss://staging.vmito.com`       |
| `GOOGLE_CLIENT_ID`     | OAuth client ID   | From Google Console             |
| `GOOGLE_CLIENT_SECRET` | OAuth secret      | From Google Console             |
| `CLOUDINARY_URL`       | Image upload      | `cloudinary://key:secret@cloud` |

### Frontend (.env.staging)

| Variable                            | Description      | Example                         |
| ----------------------------------- | ---------------- | ------------------------------- |
| `NEXTAUTH_URL`                      | Frontend URL     | `https://staging.vmito.com`     |
| `NEXT_PUBLIC_API_URL`               | Backend API      | `https://staging.vmito.com/api` |
| `NEXT_PUBLIC_WS_URL`                | WebSocket        | `wss://staging.vmito.com`       |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary cloud | Your cloud name                 |

---

## Useful Commands

### View Logs

```bash
# All services
docker compose -f docker-compose.staging.yml logs -f

# Specific service
docker compose -f docker-compose.staging.yml logs -f backend-staging
docker compose -f docker-compose.staging.yml logs -f frontend-staging
docker compose -f docker-compose.staging.yml logs -f db-staging
```

### Check Status

```bash
docker compose -f docker-compose.staging.yml ps
```

### Restart Services

```bash
# All services
docker compose -f docker-compose.staging.yml restart

# Specific service
docker compose -f docker-compose.staging.yml restart backend-staging
```

### Database Access

```bash
# Connect to staging database
docker compose -f docker-compose.staging.yml exec db-staging psql -U badminton -d badminton_staging

# Run migrations
docker compose -f docker-compose.staging.yml exec backend-staging npx prisma migrate deploy
```

### Stop Staging Environment

```bash
docker compose -f docker-compose.staging.yml down
```

### Remove All Staging Data

```bash
docker compose -f docker-compose.staging.yml down -v
docker volume rm badminton_postgres_data_staging
```

---

## Troubleshooting

### Containers Not Starting

Check logs:

```bash
docker compose -f docker-compose.staging.yml logs
```

Common issues:

- **Database not ready**: Wait for health check to pass
- **Port conflicts**: Ensure ports 8000, 8001, 5433, 8080 are available
- **Environment variables**: Verify `.env.staging` exists and is loaded

### SSL Certificate Issues

Renew certificate:

```bash
docker compose -f docker-compose.staging.yml run --rm certbot-staging renew
docker compose -f docker-compose.staging.yml restart nginx-staging
```

### Database Connection Errors

Check database is running:

```bash
docker compose -f docker-compose.staging.yml ps db-staging
```

Test connection:

```bash
docker compose -f docker-compose.staging.yml exec db-staging pg_isready -U badminton
```

### Frontend/Backend Not Communicating

Verify network:

```bash
docker network inspect badminton-network-staging
```

Check nginx configuration:

```bash
docker compose -f docker-compose.staging.yml exec nginx-staging nginx -t
```

---

## Differences from Production

| Aspect         | Production          | Staging                     |
| -------------- | ------------------- | --------------------------- |
| URL            | `vmito.com`         | `staging.vmito.com`         |
| Database       | `badminton`         | `badminton_staging`         |
| Database Port  | 5432                | 5433                        |
| Frontend Port  | 3000                | 8000                        |
| Backend Port   | 3001                | 8001                        |
| Nginx Port     | 80/443              | 8080/8443                   |
| Docker Network | `badminton-network` | `badminton-network-staging` |
| Image Tag      | `latest`            | `staging`                   |
| Git Branch     | `main`              | `develop`/`staging`         |
| NODE_ENV       | `production`        | `staging`                   |

---

## Security Considerations

1. **Use different secrets**: Never reuse production JWT secrets or passwords
2. **Separate OAuth app**: Consider using a separate Google OAuth application
3. **Firewall rules**: Optionally restrict staging access by IP
4. **Test data only**: Never use production data in staging
5. **Regular updates**: Keep staging in sync with production infrastructure

---

## Maintenance

### SSL Certificate Renewal

Certificates auto-renew via certbot. To manually renew:

```bash
docker compose -f docker-compose.staging.yml run --rm certbot-staging renew
docker compose -f docker-compose.staging.yml restart nginx-staging
```

### Database Backups

Backup staging database:

```bash
docker compose -f docker-compose.staging.yml exec db-staging pg_dump -U badminton badminton_staging > staging_backup.sql
```

Restore from backup:

```bash
cat staging_backup.sql | docker compose -f docker-compose.staging.yml exec -T db-staging psql -U badminton -d badminton_staging
```

### Cleanup Old Images

```bash
docker image prune -a -f
```

---

## Support

For issues or questions:

1. Check logs: `docker compose -f docker-compose.staging.yml logs`
2. Verify environment variables in `.env.staging`
3. Check GitHub Actions workflow runs
4. Review this documentation

---

**Last Updated**: 2026-02-09
