# Vmito - Architecture & CI/CD Pipeline Summary

This document outlines the complete server configuration, technology stack, infrastructure, and deployment (CI/CD) pipelines for the Vmito Platform (Badminton Session & Tournament Management).

> For detailed server configuration, container state, port mapping, nginx routing, and environment variable reference, see [INFRASTRUCTURE.md](../INFRASTRUCTURE.md).

---

## 1. System Architecture & Infrastructure

### 1.1. Hosting & Deployment Environment
- **Provider**: DigitalOcean VPS
- **Deployment Strategy**: Containerization using **Docker & Docker Compose**.
- **Working Directory**: `/opt/badminton`

### 1.2. Technology Stack
- **Frontend Layer (`badminton-frontend`)**:
  - **Framework**: Next.js 15 (App Router).
  - **State Management**: Zustand
  - **Styling**: Chakra UI v3 + Tailwind CSS.
  - **i18n**: next-intl (vi, en, cn).
- **Backend API Layer (`badminton-backend`)**:
  - **Framework**: NestJS (Node.js 20).
  - **Real-time**: Socket.io (WebSockets).
  - **Auth Methods**: JWT Auth, Google OAuth, Facebook OAuth, Zalo OAuth.
  - **Integrations**: Gemini AI API, Cloudinary (image/asset uploads), Stream Chat, Firebase (push notifications), Resend (email), Apify (crawler).
- **Database Layer**:
  - **Engine**: PostgreSQL 16 (accessed via Prisma ORM).
- **Reverse Proxy / Web Server**:
  - **Service**: NGINX (`nginx:alpine`) — handles TLS termination, rate limiting, WebSocket upgrade, and static file serving.

### 1.3. Network & Container Layout

Production and staging run on the **same server** under `/opt/badminton`, sharing a single NGINX container and a single Docker network (`badminton-shared-net`):

- `docker-compose.yml` — production stack (db, backend, frontend, nginx, certbot). Creates `badminton-shared-net`.
- `docker-compose.staging.yml` — staging stack (db-staging, backend-staging; frontend-staging currently disabled). Uses `badminton-shared-net` as `external`.

NGINX routes by `server_name` (`vmito.com` → production, `staging.vmito.com` → staging).

### 1.4. Automated Backup Configuration
- **Method**: `pg_dump` + `gzip`.
- **Sync Tool**: Rclone
- **Storage**: Google Drive (`gdrive:/DB_Backups/mydb`)
- **Schedule**: Cron job runs every **Sunday and Wednesday at 02:00 AM** (`0 2 * * 0,3`).
- **Script Location**: `/opt/scripts/backup_db.sh` (run as root).
- **Note**: Staging backup script (`backup_db_staging.sh`) currently exists but is empty — staging DB is not backed up.

---

## 2. CI/CD Pipeline (GitHub Actions)

The deployment pipeline is fully automated via GitHub Actions, separating test, build, and deployment steps for both Frontend and Backend modules. Pull requests (PRs) do not trigger deployments directly. Deployments are triggered strictly on pushes to specific branches (`main` for production, `staging` for testing environment).

### 2.1. Backend Pipeline (`deploy.yml`)
- **Trigger**: Push to `main` branch.
- **Job 1: Test**
  - Sets up pnpm (v10.5.2) and Node.js v20.
  - Installs dependencies (`--frozen-lockfile`).
  - Runs Linters and Tests (`pnpm lint`, `pnpm test`).
- **Job 2: Build and Push**
  - Container Registry: Docker Hub (`docker.io`) — image: `nhatcuongboy/badminton-backend`.
  - Builds the Docker image and pushes it to Docker Hub using GitHub action cache modes.
- **Job 3: Deploy**
  - Connects to the DigitalOcean server via SSH (`appleboy/ssh-action`).
  - Navigates to `/opt/badminton`.
  - Executes:
    1. `docker compose pull backend`
    2. `docker compose up -d backend`
    3. `docker image prune -a -f` (Cleans up old, unused images).

### 2.2. Frontend Pipeline (`deploy.yml`)
- **Trigger**: Push to `main` branch.
- **Job 1: Test**
  - Sets up pnpm and Node.js.
  - Runs linters and type verifications (`pnpm lint`, `tsc --noEmit`).
- **Job 2: Build and Push (with Build Args)**
  - Container Registry: Docker Hub — image: `nhatcuongboy/badminton-frontend`.
  - Injects **environment variables** at build time using GitHub Secrets (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
  - Pushes built Next.js Docker container to Docker Hub.
- **Job 3: Deploy**
  - Connects to the DigitalOcean server via SSH.
  - Navigates to `/opt/badminton`.
  - Executes:
    1. `docker compose pull frontend`
    2. `docker compose up -d frontend`
    3. `docker image prune -a -f`

---

## 3. Environment & Secrets Management
- **Backend Env (`.env`)**: Manages PostgreSQL credentials, JWT tokens, OAuth Client IDs (Google/Facebook/Zalo), Gemini API key, Cloudinary URL, Stream Chat, Firebase, Resend, Apify, and CORS origins. See `INFRASTRUCTURE.md §9` for full variable list.
- **Staging Env (`.env.staging`)**: Separate file; must be explicitly passed via `--env-file .env.staging` when running staging compose commands.
- **GitHub Secrets**: Used in CI/CD to secure Docker Hub credentials, DigitalOcean server SSH details (Host, Username, SSH Key), and frontend Next.js public keys.

---

## 4. Key Takeaways & Best Practices Active in this architecture
1. **Zero-Downtime concept via Docker**: Using `docker compose pull` and `up -d` ensures the new container replaces the old one cleanly.
2. **Automated Cleanup**: The `docker image prune` command solves the issue of the server disk filling up over time from dangling CI/CD images.
3. **Data Safety**: Standalone server-level cron backup (Sun & Wed 02:00 AM) syncs DB dumps to Google Drive off-site.
4. **Shared NGINX**: A single nginx container handles both production and staging routing, with SSL certs managed by Let's Encrypt (certbot). **Important**: staging frontend (`badminton-frontend-staging`) is currently disabled — `staging.vmito.com/` returns 502; only `/api/` and `/socket.io/` are functional on staging.
