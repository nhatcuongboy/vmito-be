# Badminton Backend

NestJS RESTful API for Badminton Session & Tournament Management.

## Quick Start

```bash
# Install
pnpm install

# Configure
cp .env.example .env

# Database
pnpm prisma generate
pnpm prisma db push

# Run
pnpm run start:dev
```

**Server**: http://localhost:3001

## Tech Stack

- **Framework**: NestJS 10.x
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT + Google OAuth
- **Language**: TypeScript

## Documentation

| Document | Description |
|----------|-------------|
| [API Reference](docs/API-REFERENCE.md) | All endpoints with auth & examples |
| [Database Schema](docs/DATABASE-SCHEMA.md) | Models, relations, enums |
| [Setup Guide](docs/SETUP-GUIDE.md) | Installation & configuration |
| [Architecture](docs/ARCHITECTURE.md) | Module structure & patterns |

## Core Features

- **Sessions**: Create and manage badminton sessions
- **Players**: Player registration, join by code, waiting queue
- **Courts**: Court management, match flow, auto-assign
- **Tournaments**: Tournament organization with categories & groups

## API Modules

| Module | Endpoints |
|--------|-----------|
| Auth | `/auth/*` - Register, Login, OAuth |
| Sessions | `/sessions/*` - CRUD, start/end, status |
| Players | `/players/*` - Join, CRUD, bulk operations |
| Courts | `/courts/*` - Select players, matches |
| Tournaments | `/tournaments/*` - CRUD, categories |
| Users | `/users/*` - User management |

## Commands

```bash
pnpm run start:dev    # Development
pnpm run build        # Build
pnpm run test         # Test
pnpm prisma studio    # Database GUI
```

## Environment

Required variables (see `.env.example`):
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET` - JWT signing secret
- `CORS_ORIGIN` - Frontend URL

## License

Private
