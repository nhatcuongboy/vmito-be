# Backend Architecture

**Framework**: NestJS 10.x  
**Pattern**: Modular Monolith  
**Last Updated**: January 22, 2026

---

## Overview

```
┌────────────────────────────────────────────────────┐
│                    Frontend                         │
│              (Next.js @ localhost:3000)             │
└─────────────────────┬──────────────────────────────┘
                      │ HTTP/REST
                      ▼
┌────────────────────────────────────────────────────┐
│                 NestJS Backend                      │
│              (localhost:3001)                       │
├─────────────────────┴──────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Guards  │  │  Pipes   │  │Interceptors│         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       └─────────────┼─────────────┘                 │
│                     ▼                               │
│  ┌─────────────────────────────────────────────┐   │
│  │              Controllers                     │   │
│  │  auth │ sessions │ players │ courts │ ...   │   │
│  └────────────────────┬────────────────────────┘   │
│                       ▼                             │
│  ┌─────────────────────────────────────────────┐   │
│  │               Services                       │   │
│  │  Business logic, data validation            │   │
│  └────────────────────┬────────────────────────┘   │
│                       ▼                             │
│  ┌─────────────────────────────────────────────┐   │
│  │            Prisma Service                    │   │
│  │         Database abstraction                 │   │
│  └────────────────────┬────────────────────────┘   │
└───────────────────────┼────────────────────────────┘
                        ▼
              ┌──────────────────┐
              │   PostgreSQL     │
              │    Database      │
              └──────────────────┘
```

---

## Modules

### Core Modules

| Module | Purpose | Dependencies |
|--------|---------|--------------|
| `AuthModule` | Authentication & Authorization | PrismaModule, ConfigModule |
| `SessionsModule` | Session CRUD & management | PrismaModule, AuthModule |
| `PlayersModule` | Player management | PrismaModule, SessionsModule |
| `CourtsModule` | Court operations | PrismaModule, MatchesModule |
| `MatchesModule` | Match lifecycle | PrismaModule |
| `UsersModule` | User management | PrismaModule, AuthModule |

### Tournament Modules

| Module | Purpose |
|--------|---------|
| `TournamentsModule` | Tournament CRUD |
| `CategoriesModule` | Category & group management |

### Infrastructure Modules

| Module | Purpose |
|--------|---------|
| `PrismaModule` | Database service |
| `ConfigModule` | Configuration |
| `HealthModule` | Health checks |
| `TasksModule` | Scheduled jobs |
| `AiModule` | AI features (player suggestions) |

---

## Authentication Flow

### JWT Authentication

```
1. User → POST /auth/login → { email, password }
2. Backend validates credentials
3. Backend generates JWT with { userId, email, role }
4. Returns → { accessToken, user }
5. Frontend stores token
6. Subsequent requests include: Authorization: Bearer <token>
7. JwtAuthGuard validates token on protected routes
```

### Google OAuth Flow

```
1. User → GET /auth/google
2. Redirect to Google consent screen
3. User authorizes
4. Google → GET /auth/google/callback?code=xxx
5. Backend exchanges code for user info
6. Creates/updates user in database
7. Generates JWT
8. Redirects to frontend with token
```

---

## Request Lifecycle

```
Request
   │
   ▼
┌──────────────┐
│  Middleware  │  CORS, Logging
└──────┬───────┘
       ▼
┌──────────────┐
│   Guards     │  JwtAuthGuard, AdminGuard
└──────┬───────┘
       ▼
┌──────────────┐
│    Pipes     │  ValidationPipe
└──────┬───────┘
       ▼
┌──────────────┐
│  Controller  │  Route handler
└──────┬───────┘
       ▼
┌──────────────┐
│   Service    │  Business logic
└──────┬───────┘
       ▼
┌──────────────┐
│   Prisma     │  Database query
└──────┬───────┘
       ▼
┌──────────────┐
│ Interceptors │  Response transformation
└──────┬───────┘
       ▼
Response
```

---

## Guards

### JwtAuthGuard
- Validates JWT token
- Extracts user from token
- Attaches to `request.user`

### AdminGuard
- Requires user role = `ADMIN`
- Used for sensitive operations

### Public Decorator
- Bypasses JwtAuthGuard
- For public endpoints

---

## Data Flow Example: Start Match

```
1. POST /courts/:id/start-match
   │
   ▼
2. CourtsController.startMatch(courtId)
   │
   ▼
3. CourtsService.startMatch(courtId)
   │
   ├─ Validate court status is READY
   ├─ Get pre-selected players
   ├─ Create Match record
   ├─ Create MatchPlayer records
   ├─ Update Player statuses to PLAYING
   ├─ Update Court status to IN_USE
   │
   ▼
4. Return match details
```

---

## Error Handling

### Custom Exceptions
```typescript
throw new BadRequestException('Invalid input');
throw new UnauthorizedException('Invalid token');
throw new ForbiddenException('Access denied');
throw new NotFoundException('Resource not found');
```

### Response Format
```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

---

## Caching Strategy

Currently using in-memory caching for:
- Session status (with TTL)
- Player statistics

Future: Redis for distributed caching

---

## Scheduled Tasks

| Task | Schedule | Purpose |
|------|----------|---------|
| Wait time update | Every minute | Update player wait times |
| Session cleanup | Daily | Archive old sessions |

---

## Security

- **JWT Tokens**: 7-day expiry
- **Password Hashing**: bcrypt
- **CORS**: Configured for frontend origin
- **Rate Limiting**: (To be implemented)
- **Input Validation**: class-validator DTOs
