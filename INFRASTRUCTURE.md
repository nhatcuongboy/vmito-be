# Vmito – Tổng hợp cấu hình server (hỗ trợ investigate)

> Tài liệu mô tả cấu hình hạ tầng của `/opt/badminton`: FE, BE, DB, Nginx, docker-compose, port mapping, env.
> Khảo sát ngày 2026-11-04 (trạng thái container lấy từ `docker ps` thời điểm đó).
> **Không chứa giá trị secret.** Với file `.env*` chỉ liệt kê tên biến và các giá trị không nhạy cảm (URL, version, flag).

---

## 1. Tổng quan kiến trúc

```
                    Internet
                       │  80 / 443
              ┌────────▼─────────┐
              │ badminton-nginx  │  nginx:alpine, TLS (Let's Encrypt), rate limit, static /courts/
              └───┬─────────┬────┘
   vmito.com      │         │      staging.vmito.com
  ┌───────────────┘         └──────────────────────┐
  │  /            → badminton-frontend:3000        │  /            → badminton-frontend-staging:3000  ⚠ KHÔNG CHẠY
  │  /api/        → badminton-backend:3001         │  /api/        → badminton-backend-staging:3001
  │  /socket.io/  → badminton-backend:3001         │  /socket.io/  → badminton-backend-staging:3001
  │  /courts/     → alias file tĩnh trên disk      │  /courts/     → cùng thư mục với prod
  └───────┬───────────────────┐                    └───────────────┬───────────────┐
          │                   │                                    │               │
 ┌────────▼───────┐  ┌────────▼────────┐                   ┌───────▼────────┐ ┌────▼──────────┐
 │ badminton-     │  │ badminton-      │                   │ badminton-     │ │ badminton-    │
 │ frontend       │  │ backend         │                   │ backend-staging│ │ db-staging    │
 │ (FE)           │  │ (BE)            │                   │ (BE)           │ │ postgres:16   │
 └────────────────┘  └────────┬────────┘                   └───────┬────────┘ └───────────────┘
                              │                                    │
                     ┌────────▼────────┐                           └──► db-staging:5432
                     │ badminton-db    │
                     │ postgres:16     │
                     └─────────────────┘
```

- Tất cả container nằm chung network Docker **`badminton-shared-net`** (bridge). Nginx phân giải tên container qua Docker DNS (`resolver 127.0.0.11`).
- Production và staging **dùng chung 1 nginx** (nằm trong `docker-compose.yml`), chia theo `server_name`.
- Production và staging **dùng chung 1 server vật lý** (DigitalOcean), thư mục `/opt/badminton`.

---

## 2. Cấu trúc thư mục `/opt/badminton`

| Đường dẫn | Mô tả |
|---|---|
| `docker-compose.yml` | Stack **production**: db, backend, frontend, nginx, certbot. Tạo network `badminton-shared-net`. |
| `docker-compose.staging.yml` | Stack **staging**: db-staging, backend-staging (frontend-staging đang bị comment). Dùng network `badminton-shared-net` dạng `external`. |
| `nginx/nginx.conf` | Config nginx duy nhất, mount `:ro` vào container. Có thay đổi đã staged chưa commit (+6 dòng). |
| `.env` | Biến môi trường production (gitignored). |
| `.env.staging` | Biến môi trường staging (gitignored). |
| `data/certbot/conf` | `/etc/letsencrypt` – chứng chỉ SSL. Có cert cho: `vmito.com`, `staging.vmito.com`, `openclaw.vmito.com`, `9router.vmito.com`. |
| `data/certbot/www` | Webroot cho ACME challenge. |
| `data/uploads/courts/` | Ảnh sân cầu lông, nginx serve trực tiếp tại `/courts/`. Có `app-release.apk` (~150MB) và thư mục `ho_chi_minh/`. |
| `backups/`, `config/` | Hiện **rỗng**. |
| `.github/copilot-instructions.md` | Quy tắc cho Copilot: không sửa/gợi ý thay đổi nội dung `.env`. |

Project name Docker Compose là `badminton` (theo tên thư mục) → volume thực tế: `badminton_postgres_data`, `badminton_postgres_data_staging`.

---

## 3. Bảng port mapping

| Service | Container | Port trong container | Port publish ra host | Bind | Ghi chú |
|---|---|---|---|---|---|
| nginx | `badminton-nginx` | 80, 443 | **80, 443** | 0.0.0.0 | Cổng public duy nhất cần thiết |
| frontend (prod) | `badminton-frontend` | 3000 | **3000** | 0.0.0.0 | Truy cập trực tiếp được từ ngoài, không qua nginx |
| backend (prod) | `badminton-backend` | 3001 | **3001** | 0.0.0.0 | idem |
| db (prod) | `badminton-db` | 5432 | **5432** | 0.0.0.0 | Dòng bind `127.0.0.1:5432` đang bị comment |
| backend (staging) | `badminton-backend-staging` | 3001 | **8001** | 0.0.0.0 | |
| db (staging) | `badminton-db-staging` | 5432 | **5433** | 0.0.0.0 | |
| frontend (staging) | `badminton-frontend-staging` | 3000 | 8000 (đã comment) | – | **Service đang tắt** |
| openclaw | `openclaw-service` | 18789 | – | – | Container đã `Exited` 5 tháng trước |
| 9router | `9router-service` | 20128 | – | – | Container đã `Exited` 5 tháng trước |

Giao tiếp nội bộ giữa container dùng port **trong container** (3000/3001/5432), không phải port host.

> Firewall: `ufw status` = **inactive** → mọi port được publish ở trên đều mở ra Internet (trừ khi có firewall cloud ở tầng DigitalOcean, chưa kiểm tra được).

---

## 4. Trạng thái container tại thời điểm khảo sát

| Container | Image | Trạng thái |
|---|---|---|
| badminton-nginx | nginx:alpine | Up 3 tháng |
| badminton-frontend | nhatcuongboy/badminton-frontend:latest | Up 23 giờ |
| badminton-backend | nhatcuongboy/badminton-backend:latest | Up 23 giờ |
| badminton-db | postgres:16-alpine | Up 6 tháng (healthy) |
| badminton-backend-staging | nhatcuongboy/badminton-backend:staging | Up 23 giờ |
| badminton-db-staging | postgres:16-alpine | Up 2 tuần (healthy) |
| badminton-certbot-1 | certbot/certbot | Exited (1) 6 tháng trước |
| openclaw-service, 9router-service, telegram-bot-openclaw | – | Exited 5 tháng trước |
| *(không có)* badminton-frontend-staging | – | **Không tồn tại** |

Docker registry: `docker.io`, tài khoản image `nhatcuongboy/…` (`badminton-backend`, `badminton-frontend`).

---

## 5. Database (PostgreSQL)

| | Production | Staging |
|---|---|---|
| Service / container | `db` / `badminton-db` | `db-staging` / `badminton-db-staging` |
| Image | `postgres:16-alpine` | `postgres:16-alpine` |
| Volume | `postgres_data` (→ `badminton_postgres_data`) | `postgres_data_staging` |
| Host port | 5432 | 5433 |
| Host trong `DATABASE_URL` | `db:5432` | `db-staging:5432` |
| User / DB | `${POSTGRES_USER}` / `${POSTGRES_DB}` – trong `.env` là `admin` / `badminton` (default trong compose là `badminton`/`badminton`) | cùng giá trị default; trong `.env.staging` cũng là `admin` / `badminton` |
| Healthcheck | `pg_isready` mỗi 10s, timeout 5s, retry 5 | idem |
| Restart | `unless-stopped` | `unless-stopped` |

- `DATABASE_URL` và `DIRECT_URL` của BE trỏ cùng một URL, dạng `postgresql://USER:PASS@<host>:5432/<db>?schema=public` (compose tự ghép từ `POSTGRES_*`, ghi đè giá trị trong `env_file`).
- Kết nối từ ngoài host: `localhost:5432` (prod), `localhost:5433` (staging).
- **Backup**: cron root chạy `/opt/scripts/backup_db.sh` lúc 02:00 Chủ nhật và Thứ tư → `pg_dump` (host `localhost`, user/db prod) → gzip → `rclone copy` lên Google Drive (`gdrive:/DB_Backups/mydb`). Script này **chứa mật khẩu DB dạng plaintext**. `backup_db_staging.sh` là file **rỗng** (0 byte) → staging chưa có backup. Thư mục `/opt/badminton/backups` rỗng.

---

## 6. Backend & Frontend (container runtime)

| | Backend | Frontend |
|---|---|---|
| Container (prod / staging) | `badminton-backend` / `badminton-backend-staging` | `badminton-frontend` / *(staging đang tắt)* |
| Image | `${DOCKER_REGISTRY}/${DOCKER_USERNAME}/badminton-backend:${BACKEND_VERSION}` | `…/badminton-frontend:${FRONTEND_VERSION}` |
| Port trong container | 3001 (`PORT=3001` set trong compose) | 3000 |
| Port host | 3001 (prod), 8001 (staging) | 3000 (prod) |
| `NODE_ENV` | `production` (prod), `staging` (staging) | – |
| Phụ thuộc | `db` / `db-staging` (service_healthy) | `backend` (chỉ thứ tự start) |
| Healthcheck Docker | **không có** | **không có** |

`depends_on` của frontend/nginx chỉ đảm bảo thứ tự start, không đợi app sẵn sàng; container "Up" không đảm bảo app khoẻ.

### Biến môi trường backend truyền qua compose (prod)
Tên biến (giá trị lấy từ `.env`):
`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT=3001`, `NODE_ENV=production`, `FRONTEND_URL`, `CORS_ORIGIN`, `CORS_CREDENTIALS`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`, `CLOUDINARY_URL`, `ZALO_APP_ID/SECRET_KEY/CALLBACK_URL`, `APIFY_WEBHOOK_SECRET`, `APIFY_TOKEN`, `APIFY_TOKENS`, `CRAWLER_BOT_USER_ID`, `CRAWLER_USE_AI`, `RESEND_API_KEY`, `MAIL_FROM`, `FACEBOOK_CLIENT_ID/CLIENT_SECRET/CALLBACK_URL`, `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`, `STREAM_API_KEY/API_SECRET`, `STREAM_CHAT_TERMS_VERSION`.

Prod không có `env_file` → container chỉ nhận đúng các biến ở khối `environment:`. `REFRESH_TOKEN_EXPIRES_IN` có trong `.env` nhưng **không** được truyền vào container backend.

### Biến môi trường frontend truyền qua compose (prod)
`NEXT_PUBLIC_API_URL=${BACKEND_URL}`, `NEXT_PUBLIC_WS_URL=${WS_URL}`, `INTERNAL_API_URL`, `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`, `INDEXNOW_SECRET`.

`INTERNAL_API_URL` (prod: `http://badminton-backend:3001/api`) là địa chỉ nội bộ trong network Docker, đi thẳng tới backend mà không qua nginx.

---

## 7. Nginx – `nginx/nginx.conf`

Image `nginx:alpine`, mount: `nginx.conf` (ro), `data/certbot/conf`, `data/certbot/www`, `data/uploads` → `/var/www/uploads`. `worker_connections 1024`.

**Rate limit zone**: `api` và `api_staging` – 10 req/s theo IP, `burst=20 nodelay` trên `/api/`.

### Virtual host

| server_name | Listen | Hành vi |
|---|---|---|
| `vmito.com`, `www.vmito.com`, `staging.vmito.com` | 80 | ACME challenge ở `/.well-known/acme-challenge/` (root `/var/www/certbot`), còn lại `301 → https://$host$request_uri` |
| `vmito.com`, `www.vmito.com` | 443 | Production (bảng dưới). Cert `live/vmito.com` |
| `staging.vmito.com` | 443 | Staging (bảng dưới). Cert `live/staging.vmito.com` |
| `openclaw.vmito.com` | 80/443 | Proxy → `openclaw-service:18789`, timeout 600s, set `Origin`. **Upstream đang tắt.** |
| `9router.vmito.com` | 80/443 | Proxy → `9router-service:20128`, timeout 600s. **Upstream đang tắt.** |

### Location của prod / staging

| Location | Prod → | Staging → | Chi tiết |
|---|---|---|---|
| `/courts/` | alias `/var/www/uploads/courts/` | giống prod (dùng chung ảnh) | `autoindex off`, `expires 30d`, `Cache-Control: public` |
| `/` | `badminton-frontend:3000` | `badminton-frontend-staging:3000` | Upgrade/Connection headers, `X-Forwarded-*`, `X-Real-IP` |
| `/api/` | `badminton-backend:3001` | `badminton-backend-staging:3001` | `limit_req`, `client_max_body_size 12m` (BE nhận tối đa 10MB) |
| `/socket.io/` | `badminton-backend:3001` | `badminton-backend-staging:3001` | `proxy_read_timeout`/`send_timeout 86400s` (giữ kết nối WS 24h) |

Chi tiết kỹ thuật cần nhớ:
- Upstream dùng `set $var "name"; proxy_pass http://$var:port;` + `resolver 127.0.0.11 valid=30s` → nginx **không** fail khi khởi động nếu container upstream chưa tồn tại, mà trả **502** lúc có request. Vì vậy nginx vẫn chạy bình thường dù `badminton-frontend-staging`, `openclaw-service`, `9router-service` không chạy.
- `ssl_protocols TLSv1.2 TLSv1.3`, `ssl_ciphers HIGH:!aNULL:!MD5`. Không có `http2`, không có `gzip` cấu hình.
- Sửa nginx.conf xong cần reload: `docker exec badminton-nginx nginx -t && docker exec badminton-nginx nginx -s reload`.

---

## 8. docker-compose

### `docker-compose.yml` (production) – `version: "3.9"`

| Service | Image | depends_on | env_file | Ghi chú |
|---|---|---|---|---|
| `db` | `postgres:16-alpine` | – | (mặc định `.env` để substitute) | volume `postgres_data`, healthcheck |
| `backend` | `${DOCKER_REGISTRY:-docker.io}/${DOCKER_USERNAME}/badminton-backend:${BACKEND_VERSION:-latest}` | `db` (service_healthy) | không | env liệt kê trực tiếp (mục 6) |
| `frontend` | `…/badminton-frontend:${FRONTEND_VERSION:-latest}` | `backend` (chỉ thứ tự start) | không | |
| `nginx` | `nginx:alpine` | `frontend`, `backend` | không | publish 80/443, mount config/cert/uploads |
| `certbot` | `certbot/certbot` | – | – | Không có `command`/entrypoint gia hạn → container chạy rồi thoát (`Exited (1)`) |

Network `badminton-shared-net` (driver bridge) do file này tạo ra; `restart: unless-stopped` cho mọi service trừ certbot.

### `docker-compose.staging.yml`

| Service | Image tag mặc định | Ghi chú |
|---|---|---|
| `db-staging` | `postgres:16-alpine` | `env_file: .env.staging`, port `5433:5432`, volume `postgres_data_staging` |
| `backend-staging` | `…/badminton-backend:${BACKEND_VERSION:-staging}` | `env_file: .env.staging`, `NODE_ENV=staging`, port `8001:3001`, `CORS_ORIGIN` **hard-code** `https://staging.vmito.com,http://localhost:3000`, `CORS_CREDENTIALS="true"` |
| `frontend-staging` | – | **Bị comment** ("tạm thời tắt") |

Network: `badminton-shared-net` `external: true` → **phải start stack prod trước** (hoặc network phải tồn tại) thì stack staging mới lên được.

BE staging chỉ truyền thẳng các biến: DB, JWT, Gemini, Google, Cloudinary, Zalo, Firebase. Các biến khác (Stream, Resend, Facebook, Apify…) chỉ có nếu nằm trong `.env.staging` (qua `env_file`). `.env.staging` hiện **không có**: `STREAM_*`, `RESEND_API_KEY`, `MAIL_FROM`, `FACEBOOK_*`, `FIREBASE_*`, `APIFY_*`, `CORS_ORIGIN`.

### Lệnh vận hành

```bash
cd /opt/badminton

# Production
docker compose ps
docker compose logs -f backend            # hoặc frontend / nginx / db
docker compose pull backend && docker compose up -d backend

# Staging  (BẮT BUỘC --env-file .env.staging, nếu không compose sẽ substitute ${...} từ .env của prod)
docker compose --env-file .env.staging -f docker-compose.staging.yml ps
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f backend-staging

# Nginx
docker exec badminton-nginx nginx -t && docker exec badminton-nginx nginx -s reload

# Kết nối DB
docker exec -it badminton-db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

---

## 9. Biến môi trường – file nào cấp cho ai

Có **hai cơ chế khác nhau**, dễ gây nhầm lẫn khi investigate:

1. **Variable substitution** (`${VAR}` trong file compose): đọc từ `.env` ở thư mục project, hoặc file chỉ định bằng `--env-file`. Chỉ ảnh hưởng nội dung compose.
2. **`env_file:`** (chỉ staging): nạp **toàn bộ** biến trong `.env.staging` vào container; nhưng `environment:` ghi đè khi trùng tên.

Hệ quả:
- Prod: không có `env_file` → container chỉ nhận đúng các biến ở khối `environment:`.
- Staging: phải chạy với `--env-file .env.staging`. Nếu quên, `${POSTGRES_PASSWORD}`, `${JWT_SECRET}`… được substitute từ `.env` **của prod**.

### Tên biến trong `.env` (prod)
`ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`, `APIFY_TOKEN`, `APIFY_TOKENS`, `APIFY_WEBHOOK_SECRET`, `APPLE_TEAM_ID`, `BACKEND_URL`, `BACKEND_VERSION`, `CLOUDINARY_URL`, `CORS_CREDENTIALS`, `CORS_ORIGIN`, `CRAWLER_BOT_USER_ID`, `CRAWLER_USE_AI`, `DOCKER_REGISTRY`, `DOCKER_USERNAME`, `FACEBOOK_CALLBACK_URL`, `FACEBOOK_CLIENT_ID`, `FACEBOOK_CLIENT_SECRET`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`, `FRONTEND_URL`, `FRONTEND_VERSION`, `GEMINI_API_KEY`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INDEXNOW_SECRET`, `INTERNAL_API_URL`, `IOS_BUNDLE_ID`, `JWT_EXPIRES_IN`, `JWT_SECRET`, `MAIL_FROM`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `REFRESH_TOKEN_EXPIRES_IN`, `RESEND_API_KEY`, `STREAM_API_KEY`, `STREAM_API_SECRET`, `STREAM_CHAT_TERMS_VERSION`, `WS_URL`.

### Tên biến trong `.env.staging`
`BACKEND_URL`, `BACKEND_VERSION`, `CLOUDINARY_URL`, `CRAWLER_USE_AI`, `DATABASE_URL`, `DIRECT_URL`, `DOCKER_REGISTRY`, `DOCKER_USERNAME`, `FRONTEND_URL`, `FRONTEND_VERSION`, `GEMINI_API_KEY`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTERNAL_API_URL`, `JWT_EXPIRES_IN`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `POSTGRES_DB`, `POSTGRES_PASSWORD`, `POSTGRES_USER`, `WS_URL`, `ZALO_APP_ID`, `ZALO_CALLBACK_URL`, `ZALO_SECRET_KEY`.

### Giá trị không nhạy cảm (để đối chiếu)

| Biến | Production (`.env`) | Staging (`.env.staging`) |
|---|---|---|
| `FRONTEND_URL` | `https://vmito.com` | `https://staging.vmito.com` |
| `BACKEND_URL` | `https://vmito.com/api` | `https://staging.vmito.com/api` |
| `WS_URL` | `wss://vmito.com` | `wss://staging.vmito.com` |
| `INTERNAL_API_URL` | `http://badminton-backend:3001/api` | `http://badminton-backend-staging:3001/api` |
| `GOOGLE_CALLBACK_URL` | `https://vmito.com/api/auth/google/callback` | `https://staging.vmito.com/api/auth/google/callback` |
| `FACEBOOK_CALLBACK_URL` | `https://vmito.com/api/auth/facebook/callback` | (không có) |
| `ZALO_CALLBACK_URL` | (không có trong `.env` → Zalo login prod nhận giá trị rỗng, xem mục 10.5) | `https://staging.vmito.com/api/auth/zalo/callback` |
| `CORS_ORIGIN` | `https://vmito.com,https://www.vmito.com,http://localhost:3000,http://localhost:5173` | hard-code trong compose: `https://staging.vmito.com,http://localhost:3000` |
| `CORS_CREDENTIALS` | `true` | `true` (compose) |
| `BACKEND_VERSION` / `FRONTEND_VERSION` | `latest` / `latest` | `staging` / `staging` |
| `JWT_EXPIRES_IN` | `7d` | `7d` |
| `REFRESH_TOKEN_EXPIRES_IN` | `30d` | (không có) |
| `CRAWLER_USE_AI` | xem mục 10.2 (khai báo 2 lần) | `false` |
| `NEXT_PUBLIC_APP_ENV` | – | `staging` (tắt SEO/noindex) |

---

## 10. Điểm bất thường / cần kiểm tra khi investigate

Xếp theo mức ảnh hưởng ước đoán. Đây là **quan sát**, chưa sửa gì.

1. **Staging FE không chạy nhưng nginx vẫn route tới nó** → `https://staging.vmito.com/` trả 502; chỉ `/api/` và `/socket.io/` hoạt động.
2. **`.env` có dòng bị dính**: `STREAM_CHAT_TERMS_VERSION=2026-09-13CRAWLER_USE_AI=true` nằm trên cùng một dòng (thiếu xuống dòng), và `CRAWLER_USE_AI` còn khai báo thêm lần nữa ở dòng sau với giá trị `false`. Cần xác nhận giá trị `STREAM_CHAT_TERMS_VERSION` thực tế trong container prod (`docker exec badminton-backend printenv STREAM_CHAT_TERMS_VERSION`) có phải là `2026-09-13` hay chuỗi dính. (Theo quy tắc repo, không tự sửa file `.env`.)
3. **DB và các port nội bộ mở ra Internet**: 5432, 5433, 3000, 3001, 8001 bind `0.0.0.0`, `ufw` inactive. Nếu không có firewall ở DigitalOcean thì DB prod truy cập được từ ngoài bằng user/password.
4. **`REFRESH_TOKEN_EXPIRES_IN` có trong `.env` nhưng compose prod không truyền vào container backend** → giá trị này không có tác dụng. Kiểm tra bằng `docker exec badminton-backend printenv`.
5. **Prod `.env` không có `ZALO_APP_ID`/`ZALO_SECRET_KEY`/`ZALO_CALLBACK_URL`** dù compose prod truyền chúng cho BE (thành chuỗi rỗng) → đăng nhập Zalo trên prod khả năng không hoạt động. **Staging thiếu nhiều biến** (Stream Chat, Resend/mail, Facebook, Firebase, Apify) → chat/email/push/FB login/crawler trên staging khả năng không hoạt động hoặc dùng default.
6. **Không có healthcheck Docker cho backend/frontend** → container "Up" không đảm bảo app khoẻ; `depends_on` của frontend/nginx chỉ đảm bảo thứ tự start.
7. **`badminton-certbot-1` đã Exited(1) 6 tháng, không có cron gia hạn SSL** (crontab chỉ có 2 dòng backup DB). Cert Let's Encrypt hết hạn sau 90 ngày → cần kiểm tra ngày hết hạn trong `data/certbot/conf/live/*/`.
8. **Backup**: staging không có backup (`backup_db_staging.sh` rỗng); backup prod ghi mật khẩu plaintext trong script; log ở `/var/log/db_backup.log`.
9. **Thay đổi nginx.conf chưa commit** (đã `git add`: +6 dòng). Config nginx đang chạy là file mount trực tiếp từ host nên mọi sửa đổi có hiệu lực sau khi reload nginx, không cần commit.

---

## 11. Checklist investigate nhanh

| Triệu chứng | Kiểm tra đầu tiên |
|---|---|
| 502 trên `staging.vmito.com/` | `docker ps` có `badminton-frontend-staging` không (mục 10.1) |
| 502/504 trên prod `/api/` | `docker logs badminton-backend`; `curl -i localhost:3001/api/...`; DB healthy? |
| Upload ảnh lỗi 413 | `client_max_body_size 12m` trong nginx `/api/` |
| WebSocket rớt/không kết nối | location `/socket.io/`; header `Upgrade`/`Connection`, timeout 86400s |
| 429 | Rate limit nginx (`limit_req` 10r/s, burst 20) – xem `docker logs badminton-nginx` |
| CORS lỗi | `CORS_ORIGIN` trong container thật (`printenv`), staging là giá trị hard-code trong compose |
| OAuth redirect sai | `*_CALLBACK_URL` + `FRONTEND_URL` trong container BE; callback đăng ký ở Google/Facebook/Zalo console |
| SSR chậm / timeout | `INTERNAL_API_URL` có set trong container FE không (`printenv`) |
| Cert hết hạn / TLS lỗi | `openssl x509 -enddate -noout -in data/certbot/conf/live/<domain>/fullchain.pem` |

Lệnh xem biến thực tế trong container (tránh in secret ra log/chat – chỉ lọc biến cần xem):
```bash
docker exec badminton-backend printenv | grep -E '^(NODE_ENV|PORT|CORS_|FRONTEND_URL|JWT_EXPIRES_IN|REFRESH_TOKEN_EXPIRES_IN|CRAWLER_USE_AI|STREAM_CHAT_TERMS_VERSION)='
docker exec badminton-frontend printenv | grep -E '^(NEXT_PUBLIC_|INTERNAL_API_URL|PORT|HOSTNAME)'
```
