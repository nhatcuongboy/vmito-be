# Vmito - Architecture & CI/CD Pipeline Summary

This document outlines the complete server configuration, technology stack, infrastructure, and deployment (CI/CD) pipelines for the Vmito Platform (Badminton Session & Tournament Management).

---

## 1. System Architecture & Infrastructure

### 1.1. Hosting & Deployment Environment
- **Provider**: Vultr VPS (Virtual Private Server)
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
  - **Auth Methods**: JWT Auth, Google OAuth, Facebook OAuth.
  - **Integrations**: Gemini AI API, Cloudinary (handling image/asset uploads).
- **Database Layer**:
  - **Engine**: PostgreSQL (accessed via Prisma ORM).
- **Reverse Proxy / Web Server**:
  - **Service**: NGINX (handling routing / frontend/backend proxying).

### 1.3. Automated Backup Configuration 
- **Method**: `pg_dump` mapped with `gzip`.
- **Sync Tool**: Rclone
- **Storage**: Google Drive (`gdrive:/DB_Backups/mydb`)
- **Schedule**: Cronjob setup to run weekly (every Sunday at 02:00 AM - `0 2 * * 0`).
- **Script Location**: `/opt/scripts/backup_db.sh` (executed via root/sudo).

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
  - Context: `badminton-backend`
  - Container Registry: Docker Hub (`docker.io`).
  - Extracts metadata & signs the image.
  - Builds the Docker image and pushes it to Docker Hub using GitHub action cache modes.
- **Job 3: Deploy**
  - Connects to the Vultr Server via SSH (`appleboy/ssh-action`).
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
  - Context: `badminton-frontend`
  - Injects crucial **environment variables** at build time using GitHub Secrets (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
  - Pushes built Next.js Docker container to Docker Hub.
- **Job 3: Deploy**
  - Connects to the Vultr Server via SSH.
  - Navigates to `/opt/badminton`.
  - Executes:
    1. `docker compose pull frontend`
    2. `docker compose up -d frontend`
    3. `docker image prune -a -f`

---

## 3. Environment & Secrets Management
- **Backend Env (`.env`)**: Manages PostgreSQL keys, JWT tokens, OAuth Client IDs (Google/FB), Gemini API keys, Cloudinary URIs, and CORS Origins.
- **GitHub Secrets**: Used in CI/CD to secure Docker Hub Credentials, Vultr Server SSH details (Host, Username, SSH Key), and Frontend Next.js Public Keys.

---

## 4. Key Takeaways & Best Practices Active in this architecture
1. **Zero-Downtime concept via Docker**: Using `docker compose pull` and `up -d` ensures the new container replaces the old one cleanly.
2. **Automated Cleanup**: The `docker image prune` command solves the issue of the server disk filling up over time from dangling CI/CD images.
3. **Data Safety**: Standalone server-level cron backup ensures that even if Docker Compose fails, data state is preserved safely on Google Drive off-site.
