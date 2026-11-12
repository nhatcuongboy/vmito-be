# Staging Environment Setup Guide

This guide explains how to set up and deploy the staging environment for the Badminton application.

> For current container state and environment variable reference, see [INFRASTRUCTURE.md](../INFRASTRUCTURE.md).

## Architecture Overview

The staging environment runs alongside production on the same **DigitalOcean** server (`/opt/badminton`) with the following isolation:

- **Separate containers**: Dedicated staging containers (`badminton-backend-staging`, `badminton-db-staging`)
- **Separate database**: PostgreSQL 16 instance with its own volume (`badminton_postgres_data_staging`)
- **Shared network**: Docker network `badminton-shared-net` (created by production stack; staging uses it as `external`)
- **Shared NGINX**: Production nginx container routes `staging.vmito.com` to staging containers
- **Different ports** (host-level):
  - Frontend: 8000 (currently **disabled** — `frontend-staging` service is commented out)
  - Backend: 8001 (host) → 3001 (container)
  - Database: 5433 (host) → 5432 (container)

### Current Status (as of 2026-11-04)

- **`staging.vmito.com`** is **active** — DNS and SSL cert are configured.
- **Backend staging**: running (`badminton-backend-staging`, port 8001).
- **Frontend staging**: **disabled** (service commented out in `docker-compose.staging.yml`) → `staging.vmito.com/` returns 502; only `/api/` and `/socket.io/` are functional.
- **DB staging**: running (`badminton-db-staging`, port 5433).

---

## Initial Server Setup

### 1. DNS Configuration

Staging uses subdomain `staging.vmito.com`. Add an A record pointing to the DigitalOcean server IP in your DNS provider.

Wait for DNS propagation (5–30 minutes):

```bash
nslookup staging.vmito.com
```

### 2. Server Directory Setup

SSH into the server:

```bash
ssh user@<server-ip>
```

Create staging directory (if using separate directory):

```bash
sudo mkdir -p /opt/badminton
cd /opt/badminton
```

### 3. Upload Configuration Files

From your local machine, copy the staging configuration:

```bash
# Copy docker-compose file
scp docker-compose.staging.yml user@<server-ip>:/opt/badminton/

# Copy deployment script
scp scripts/deploy-staging.sh user@<server-ip>:/opt/badminton/scripts/
```

> **Note**: There is no separate `nginx.staging.conf`. The production nginx container (`badminton-nginx`) handles both production and staging routing via `server_name` in `nginx/nginx.conf`.

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

### 5. SSL Certificate

SSL for `staging.vmito.com` is managed by the shared certbot container in `docker-compose.yml` (production stack). To issue/renew manually:

```bash
docker exec badminton-certbot-1 certbot certonly \
  --webroot -w /var/www/certbot \
  -d staging.vmito.com \
  --email your-email@example.com \
  --agree-tos --no-eff-email
docker exec badminton-nginx nginx -s reload
```

### 6. Initial Deployment

Pull images and start containers:

```bash
# Always pass --env-file to avoid substituting staging vars from production .env
docker compose --env-file .env.staging -f docker-compose.staging.yml pull

# Start services (production stack must be running first so badminton-shared-net exists)
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d

# Check status
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
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
```

> **Note**: `badminton-frontend-staging` and `badminton-nginx-staging` do **not** exist as separate containers. Staging uses the shared production nginx. Frontend staging is currently disabled.

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
- `SERVER_HOST`: DigitalOcean server IP
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
docker compose --env-file .env.staging -f docker-compose.staging.yml pull
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d backend-staging db-staging
docker image prune -f
```

---

## Environment Variables Reference

### Backend (.env.staging)

| Variable               | Description       | Example                         |
| ---------------------- | ----------------- | ------------------------------- |
| `POSTGRES_PASSWORD`    | Database password | `staging_secure_pass_123`       |
| `POSTGRES_DB`          | Database name     | `badminton`                     |
| `POSTGRES_USER`        | Database user     | `admin`                         |
| `JWT_SECRET`           | JWT signing key   | `staging-jwt-secret-xyz`        |
| `FRONTEND_URL`         | Frontend URL      | `https://staging.vmito.com`     |
| `BACKEND_URL`          | Backend API URL   | `https://staging.vmito.com/api` |
| `WS_URL`               | WebSocket URL     | `wss://staging.vmito.com`       |
| `GOOGLE_CLIENT_ID`     | OAuth client ID   | From Google Console             |
| `GOOGLE_CLIENT_SECRET` | OAuth secret      | From Google Console             |
| `CLOUDINARY_URL`       | Image upload      | `cloudinary://key:secret@cloud` |
| `GEMINI_API_KEY`       | Gemini AI key     | From Google AI Studio           |
| `ZALO_APP_ID`          | Zalo OAuth        | From Zalo Developer             |
| `ZALO_SECRET_KEY`      | Zalo OAuth secret | From Zalo Developer             |
| `ZALO_CALLBACK_URL`    | Zalo callback     | `https://staging.vmito.com/api/auth/zalo/callback` |

> **Missing from `.env.staging`**: `STREAM_*`, `RESEND_API_KEY`, `MAIL_FROM`, `FACEBOOK_*`, `FIREBASE_*`, `APIFY_*` — Stream Chat, email, push notifications, Facebook login, and crawler features will not work on staging unless added.

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
# All services (always pass --env-file)
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f

# Specific service
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f backend-staging
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f db-staging
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
# Connect to staging database (user admin, db badminton)
docker compose --env-file .env.staging -f docker-compose.staging.yml exec db-staging psql -U admin -d badminton

# Run migrations
docker compose --env-file .env.staging -f docker-compose.staging.yml exec backend-staging npx prisma migrate deploy
```

### Stop Staging Environment

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down
```

### Remove All Staging Data

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml down -v
docker volume rm badminton_postgres_data_staging
```

---

## Troubleshooting

### Containers Not Starting

Check logs:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml logs
```

Common issues:

- **Network missing**: Ensure production stack is up first so `badminton-shared-net` exists.
- **Database not ready**: Wait for health check to pass.
- **Port conflicts**: Ensure ports 8001, 5433 are available.
- **Environment variables**: Verify `.env.staging` exists and pass `--env-file .env.staging`.

### SSL Certificate Issues

SSL certificates are handled by the production certbot container and shared Nginx:

```bash
docker exec badminton-certbot-1 certbot certonly --webroot -w /var/www/certbot -d staging.vmito.com --email your-email@example.com --agree-tos --no-eff-email
docker exec badminton-nginx nginx -s reload
```

### Database Connection Errors

Check database is running:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml ps db-staging
```

Test connection:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec db-staging pg_isready -U admin -d badminton
```

### Routing & Nginx Troubleshooting

Verify network:

```bash
docker network inspect badminton-shared-net
```

Check shared nginx configuration:

```bash
docker exec badminton-nginx nginx -t
docker exec badminton-nginx nginx -s reload
```

---

## Differences from Production

| Aspect         | Production             | Staging                        |
| -------------- | ---------------------- | ------------------------------ |
| URL            | `vmito.com`            | `staging.vmito.com`            |
| Database       | `badminton`            | `badminton` (separate volume)  |
| Database Port  | 5432                   | 5433                           |
| Frontend Port  | 3000                   | 8000 (currently **disabled**)  |
| Backend Port   | 3001                   | 8001                           |
| Nginx Port     | 80 / 443 (shared)      | 80 / 443 (shared)              |
| Docker Network | `badminton-shared-net` | `badminton-shared-net` (external) |
| Image Tag      | `latest`               | `staging`                      |
| Git Branch     | `main`                 | `develop`/`staging`            |
| NODE_ENV       | `production`           | `staging`                      |

---

## Security Considerations

1. **Use different secrets**: Never reuse production JWT secrets or passwords
2. **Separate OAuth app**: Consider using a separate Google OAuth application
3. **Firewall rules**: Cloud firewall / UFW should restrict external access to ports 5432, 5433, 3000, 3001, 8001
4. **Test data only**: Never use production data in staging
5. **Regular updates**: Keep staging in sync with production infrastructure

---

## Maintenance

### SSL Certificate Renewal

SSL for both production and staging is renewed via the shared certbot container:

```bash
docker exec badminton-certbot-1 certbot renew
docker exec badminton-nginx nginx -s reload
```

### Database Backups

Backup staging database:

```bash
docker compose --env-file .env.staging -f docker-compose.staging.yml exec db-staging pg_dump -U admin badminton > staging_backup.sql
```

Restore from backup:

```bash
cat staging_backup.sql | docker compose --env-file .env.staging -f docker-compose.staging.yml exec -T db-staging psql -U admin -d badminton
```

### Cleanup Old Images

```bash
docker image prune -a -f
```

---

## Support

For issues or questions:

1. Check logs: `docker compose --env-file .env.staging -f docker-compose.staging.yml logs`
2. Verify environment variables in `.env.staging`
3. Check GitHub Actions workflow runs
4. Review this documentation and [INFRASTRUCTURE.md](../INFRASTRUCTURE.md)

---

**Last Updated**: 2026-11-05
