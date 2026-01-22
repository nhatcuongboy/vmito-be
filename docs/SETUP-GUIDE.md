# Backend Setup Guide

**Framework**: NestJS  
**Database**: PostgreSQL  
**Package Manager**: pnpm

---

## Quick Start

```bash
# 1. Clone and install
cd badminton-backend
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your values

# 3. Setup database
pnpm prisma generate
pnpm prisma db push

# 4. Start development server
pnpm run start:dev
```

Server runs at: `http://localhost:3001`

---

## Environment Variables

Create `.env` file with:

```env
# Database (Required)
DATABASE_URL=postgresql://user:pass@localhost:5432/badminton
DIRECT_URL=postgresql://user:pass@localhost:5432/badminton

# JWT (Required)
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRES_IN=7d

# Application
PORT=3001
NODE_ENV=development

# CORS (Required for frontend)
CORS_ORIGIN=http://localhost:3000
CORS_CREDENTIALS=true
FRONTEND_URL=http://localhost:3000

# Google OAuth (Optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback

# AI Features (Optional)
GEMINI_API_KEY=your-gemini-api-key
```

---

## Commands

### Development
```bash
pnpm run start:dev    # Watch mode with hot reload
pnpm run start        # Production mode
pnpm run start:debug  # Debug mode
```

### Database
```bash
pnpm prisma studio    # Visual database editor
pnpm prisma db push   # Push schema changes
pnpm prisma migrate dev --name <name>  # Create migration
pnpm prisma generate  # Generate Prisma client
```

### Testing
```bash
pnpm run test         # Unit tests
pnpm run test:e2e     # E2E tests
pnpm run test:cov     # Test coverage
```

### Build
```bash
pnpm run build        # Build for production
pnpm run lint         # Lint code
pnpm run format       # Format code
```

---

## Project Structure

```
src/
├── main.ts                 # Entry point
├── app.module.ts           # Root module
│
├── auth/                   # Authentication
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── guards/             # JWT, Google, Admin guards
│   ├── strategies/         # Passport strategies
│   └── dto/                # Data transfer objects
│
├── sessions/               # Session management
├── players/                # Player management
├── courts/                 # Court management
├── matches/                # Match management
├── tournaments/            # Tournament management
├── users/                  # User management
├── categories/             # Tournament categories
│
├── common/                 # Shared utilities
│   ├── decorators/
│   ├── filters/
│   └── interceptors/
│
├── config/                 # Configuration
├── prisma/                 # Prisma service
├── health/                 # Health check
├── pwa/                    # PWA features
├── tasks/                  # Scheduled tasks
└── ai/                     # AI features
```

---

## Docker Setup

### Development with Docker
```bash
docker-compose up -d
```

### Production Build
```bash
docker build -t badminton-backend .
docker run -p 3001:3001 badminton-backend
```

---

## Deployment

### Vercel
1. Connect repository
2. Set environment variables
3. Deploy

### Railway/Render
1. Connect repository
2. Configure PostgreSQL database
3. Set environment variables
4. Deploy

### Manual
```bash
pnpm run build
pnpm run start:prod
```

---

## API Documentation

Swagger UI available at: `http://localhost:3001/api`
(When configured)

---

## Troubleshooting

### Database connection issues
```bash
# Test connection
pnpm prisma db push

# Reset database (CAUTION: deletes all data)
pnpm prisma migrate reset
```

### Port already in use
```bash
# Find process
lsof -i :3001
# Kill process
kill -9 <PID>
```

### Prisma client outdated
```bash
pnpm prisma generate
```
