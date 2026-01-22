# Badminton Backend API Reference

**Version**: 1.0.0  
**Base URL**: `http://localhost:3001`  
**Last Updated**: January 22, 2026

---

## Overview

NestJS-based REST API for Badminton Session & Tournament Management.

**Tech Stack**:
- Framework: NestJS 10.x
- Database: PostgreSQL with Prisma ORM
- Authentication: JWT + Google OAuth

---

## Authentication

All protected endpoints require Bearer token:
```
Authorization: Bearer <access_token>
```

### Auth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Public | Register new user |
| POST | `/auth/login` | Public | Login, returns JWT |
| GET | `/auth/token` | 🔒 | Refresh JWT token |
| PUT | `/auth/change-password` | 🔒 | Change password |
| PUT | `/auth/reset-password` | Public | Reset password (admin) |
| GET | `/auth/google` | Public | Initiate Google OAuth |
| GET | `/auth/google/callback` | Public | Google OAuth callback |

#### Login Request/Response

```json
// POST /auth/login
{
  "email": "user@example.com",
  "password": "password123"
}

// Response
{
  "accessToken": "eyJhbGc...",
  "tokenType": "Bearer",
  "expiresIn": "7d",
  "user": {
    "id": "cuid123",
    "email": "user@example.com",
    "name": "User Name",
    "role": "HOST"
  }
}
```

---

## Sessions API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/sessions` | 🔒 | List user's sessions |
| GET | `/sessions/available` | 🔒 | List available sessions |
| POST | `/sessions` | 🔒 HOST | Create new session |
| GET | `/sessions/:id` | 🔒 | Get session details |
| PUT | `/sessions/:id` | 🔒 | Update session |
| DELETE | `/sessions/:id` | 🔒 | Delete session |
| POST | `/sessions/:id/start` | 🔒 | Start session |
| POST | `/sessions/:id/end` | 🔒 | End session |
| GET | `/sessions/:id/status` | 🔒 | Get real-time status |
| PATCH | `/sessions/:id/status` | 🔒 | Update session status |
| GET | `/sessions/:id/players` | 🔒 | Get session players |
| GET | `/sessions/:id/courts` | 🔒 | Get session courts |
| GET | `/sessions/:id/matches` | 🔒 | Get session matches |
| POST | `/sessions/:id/auto-assign` | 🔒 | Auto-assign players |
| GET | `/sessions/:id/waiting-queue` | 🔒 | Get waiting queue |
| PUT | `/sessions/:id/wait-times` | 🔒 | Update wait times |
| GET | `/sessions/:id/wait-times` | 🔒 | Get wait time stats |

#### Create Session

```json
// POST /sessions
{
  "name": "Friday Evening Session",
  "numberOfCourts": 2,
  "sessionDuration": 120,
  "maxPlayersPerCourt": 8,
  "requirePlayerInfo": true,
  "allowGuestJoin": true,
  "requiredLevels": [3, 4, 5],
  "startTime": "2026-01-22T18:00:00Z",
  "endTime": "2026-01-22T20:00:00Z",
  "courts": [
    { "courtNumber": 1, "courtName": "Court A", "direction": "HORIZONTAL" }
  ]
}
```

---

## Players API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/players/check-code?code=ABC123` | Public | Check join code type |
| POST | `/players/join-by-code` | Public | Join session by code |
| GET | `/players/status?token=xyz` | Public | Get player status (guest) |
| GET | `/players/guest/:id` | Public | Get player for guest confirm |
| GET | `/players/guest/:id/status?code=abc` | Public | Get player status by ID |
| GET | `/players/pending-requests` | 🔒 | Get pending requests (host) |
| GET | `/players/me/sessions` | 🔒 | Get user's sessions |
| POST | `/players/link-account` | 🔒 | Link player to account |
| GET | `/players/:id` | 🔒 | Get player by ID |
| PUT | `/players/:id` | 🔒 | Update player |
| DELETE | `/players/:id` | 🔒 | Remove player |
| POST | `/players/:id/confirm` | Public | Confirm player info (guest) |

### Session Players (nested routes)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/sessions/:id/players` | 🔒 | Add player to session |
| POST | `/sessions/:id/players/bulk` | 🔒 | Bulk add players |
| GET | `/sessions/:id/players/bulk` | 🔒 | Get bulk players info |
| PATCH | `/sessions/:id/players/bulk-update` | 🔒 | Bulk update players |
| POST | `/sessions/:id/players/register` | 🔒 | Register players |
| PATCH | `/sessions/:id/players/toggle-inactive` | 🔒 | Toggle player inactive |
| PATCH | `/sessions/:id/players/:playerId/status` | 🔒 | Approve/reject player |
| PATCH | `/sessions/:id/players/:playerId` | 🔒 | Update player in session |
| DELETE | `/sessions/:id/players/:playerId` | 🔒 | Remove from session |
| GET | `/sessions/:id/players/statistics` | 🔒 | Get player statistics |

---

## Courts API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/courts/:id` | 🔒 | Get court details |
| PATCH | `/courts/:id` | 🔒 | Update court |
| POST | `/courts/:id/select-players` | 🔒 | Select players for court |
| POST | `/courts/:id/deselect-players` | 🔒 | Deselect players |
| POST | `/courts/:id/start-match` | 🔒 | Start match on court |
| POST | `/courts/:id/end-match` | 🔒 | End match on court |
| GET | `/courts/:id/current-match` | 🔒 | Get current match |
| POST | `/courts/:id/pre-select` | 🔒 | Pre-select players |
| DELETE | `/courts/:id/pre-select` | 🔒 | Cancel pre-select |
| GET | `/courts/:id/pre-select` | 🔒 | Get pre-selected players |
| GET | `/courts/:id/suggested-players` | 🔒 | AI-suggested players |

---

## Tournaments API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/tournaments` | Public | List all tournaments |
| GET | `/tournaments/:id` | Public | Get tournament details |
| POST | `/tournaments` | 🔒 | Create tournament |
| PUT | `/tournaments/:id` | 🔒 | Update tournament |
| DELETE | `/tournaments/:id` | 🔒 | Delete tournament |

---

## Users API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/users` | 🔒 Admin/Host | List users |
| GET | `/users/:id` | 🔒 | Get user by ID |
| POST | `/users` | 🔒 Admin | Create user |
| PUT | `/users/:id` | 🔒 | Update user |
| DELETE | `/users/:id` | 🔒 Admin | Delete user |

---

## Enums

### User Roles
- `HOST` - Session organizer
- `PLAYER` - Regular player
- `ADMIN` - System administrator

### Session Status
- `PREPARING` - Not started
- `IN_PROGRESS` - Currently active
- `FINISHED` - Completed

### Player Status
- `WAITING` - In waiting queue
- `PLAYING` - Currently playing
- `FINISHED` - Done playing
- `READY` - Ready to play
- `INACTIVE` - Temporarily inactive

### Court Status
- `EMPTY` - Available
- `IN_USE` - Match in progress
- `READY` - Players selected

### Gender
- `MALE`
- `FEMALE`
- `OTHER`
- `PREFER_NOT_TO_SAY`

### Match Status
- `SCHEDULED` - Not started
- `IN_PROGRESS` - Currently playing
- `FINISHED` - Completed
- `CANCELLED` - Cancelled

---

## Error Responses

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

Common HTTP codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## Health Check

```
GET /health
```

Returns server health status.
