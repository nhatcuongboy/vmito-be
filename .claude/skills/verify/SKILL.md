---
name: verify
description: Build, launch, and drive the vmito stack (NestJS BE + Next.js FE) to verify changes end-to-end at the runtime surface.
---

# Verify vmito changes end-to-end

Two repos: backend `/Users/cuongvnnguyen/Documents/vmito/vmito-be` (NestJS + Prisma + Postgres on localhost:5432), frontend `/Users/cuongvnnguyen/Documents/vmito/vmito-fe` (Next.js 15 app router, `next dev --turbo` on :3000). BE serves `http://localhost:3001/api` (Swagger at `/api/docs`).

## Backend

- Build: `npm run build` → runs `nest build` into `dist/`. The dev process is usually a plain `node dist/src/main` (NO watch) — after rebuilding you must restart it or new code never loads: `kill <pid>; node --enable-source-maps dist/src/main &`.
- Prisma: `npx prisma migrate dev` will demand a full DB reset because of pre-existing drift (`level_definitions` label columns added outside migrations). NEVER reset. Instead: write `prisma/migrations/<ts>_<name>/migration.sql` by hand, apply with `npx prisma db execute --schema prisma/schema.prisma --file <file>`, record with `npx prisma migrate resolve --applied <name>`, then `npx prisma generate`.
- Auth for API driving: `POST /api/auth/register` + `POST /api/auth/login` (email/password, no verification step) → `data.accessToken` → `Authorization: Bearer`. Create throwaway `*@test.local` users; clean up after with a Prisma script (`user.deleteMany` cascades posts/likes/comments/notifications — delete their posts first so real feeds aren't polluted).

## Frontend

- Dev server: `npm run dev` (`next dev --turbo`) on :3000. **Never run `npm run build` while the dev server is running** — the prod build overwrites `.next` and the running dev server starts 500-ing everywhere. If that happens: kill it, `rm -rf .next`, relaunch.
- Auth in a driven browser: zustand persists to localStorage key `auth-storage` as `{"state":{user,accessToken,refreshToken,isAuthenticated},"version":0}`. Login via the BE API, then `context.addInitScript` that value before navigation — no UI login needed.
- Browser: no playwright in either repo; `npm install playwright-core` in the scratchpad and launch the cached binary at `~/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`.
- Routes are locale-prefixed: `/vi/newsfeed`, `/vi/user/<id>`, etc.

## Gotchas

- Tailwind is v4 (`@tailwindcss/postcss`); `globals.css` must use `@import 'tailwindcss'; @config '../../tailwind.config.js';` — the old v3 `@tailwind base/components/utilities` directives silently emit almost no utilities.
- Realtime notifications ride Socket.IO namespace `/sessions`, event `notification_received`, room `user-<id>`; DB rows via `GET /api/notifications` are the observable substitute.
