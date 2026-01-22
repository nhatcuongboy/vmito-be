# Database Schema Documentation

**Database**: PostgreSQL  
**ORM**: Prisma  
**Last Updated**: January 22, 2026

---

## Entity Relationship Overview

```
┌─────────┐     ┌──────────┐     ┌─────────┐
│  User   │────<│  Session │────<│  Court  │
└─────────┘     └──────────┘     └─────────┘
     │               │                │
     v               v                v
┌─────────┐     ┌─────────┐     ┌─────────┐
│ Player  │────<│  Match  │────<│MatchPlayer│
└─────────┘     └─────────┘     └─────────┘
```

---

## Core Models

### User
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| email | String | Unique email |
| name | String | Display name |
| password | String? | Hashed password (null for OAuth) |
| image | String? | Avatar URL |
| role | Role | HOST, PLAYER, ADMIN |
| gender | Gender? | Optional gender |
| level | Int? | Skill level 1-7 |
| levelDescription | String? | Level text description |
| phone | String? | Phone number |

**Relations**: hostedSessions, playerRecords, hostedTournaments

---

### Session
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Session name |
| description | String? | Optional description |
| location | String? | Location info |
| hostId | String | FK to User |
| numberOfCourts | Int | Default: 2 |
| sessionDuration | Int | Duration in minutes (default: 120) |
| maxPlayersPerCourt | Int | Default: 8 |
| status | SessionStatus | PREPARING, IN_PROGRESS, FINISHED |
| startTime | DateTime? | Actual start time |
| endTime | DateTime? | Actual end time |
| allowGuestJoin | Boolean | Allow guest players (default: true) |
| allowNewPlayers | Boolean | Allow new joins (default: true) |
| requiredLevels | Int[] | Required skill levels (empty = all) |
| courtColor | String | Court display color |

**Relations**: host, courts, players, matches

---

### Player
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| sessionId | String | FK to Session |
| userId | String? | FK to User (optional for guests) |
| playerNumber | Int | Display number in session |
| name | String? | Player name |
| gender | Gender? | Gender |
| level | Int? | Skill level 1-7 |
| levelDescription | String? | Level text |
| desire | String? | Player preferences |
| phone | String? | Contact phone |
| status | PlayerStatus | WAITING, PLAYING, etc. |
| joinCode | String | Unique join code |
| isGuest | Boolean | True if no account |
| isJoined | Boolean | Has someone joined |
| currentWaitTime | Int | Current wait in minutes |
| totalWaitTime | Int | Total wait in minutes |
| waitingSince | DateTime? | When started waiting |
| matchesPlayed | Int | Match count |
| registrationStatus | RegistrationStatus | PENDING, APPROVED, REJECTED |

**Unique**: sessionId + playerNumber

---

### Court
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| sessionId | String | FK to Session |
| courtNumber | Int | Court number in session |
| courtName | String? | Display name |
| direction | CourtDirection | HORIZONTAL, VERTICAL |
| status | CourtStatus | EMPTY, IN_USE, READY |
| currentMatchId | String? | FK to current Match |
| preSelectedPlayers | Json? | Pre-selected player data |

**Unique**: sessionId + courtNumber

---

### Match
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| sessionId | String | FK to Session |
| courtId | String | FK to Court |
| status | MatchStatus | IN_PROGRESS, FINISHED, etc. |
| startTime | DateTime | When match started |
| endTime | DateTime? | When match ended |
| isExtra | Boolean | Started after session endTime |
| score | String? | Match score |
| winnerIds | String? | Winner player IDs |
| isDraw | Boolean? | Was it a draw |
| notes | String? | Match notes |

---

### MatchPlayer
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| matchId | String | FK to Match |
| playerId | String | FK to Player |
| position | Int | Position 0-3 in match |

**Unique**: matchId + playerId, matchId + position

---

## Tournament Models

### Tournament
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| name | String | Tournament name |
| startDate | DateTime | Start date |
| endDate | DateTime | End date |
| hostId | String | FK to User |
| status | TournamentStatus | PREPARING, IN_PROGRESS, FINISHED, CANCELLED |

**Relations**: categories, players, pairs, courts, umpires

---

### Category
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| tournamentId | String | FK to Tournament |
| name | String | Category name |
| type | CategoryType | MENS_SINGLE, WOMENS_DOUBLE, etc. |
| hasGroupStage | Boolean | Has group stage |
| groupCount | Int? | Number of groups |
| matchFormat | MatchFormat | BEST_OF_1, BEST_OF_3 |

---

### TournamentPlayer
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| tournamentId | String | FK to Tournament |
| name | String | Player name |
| email | String? | Email |
| phone | String? | Phone |
| gender | Gender? | Gender |
| level | Int? | Skill level |
| userId | String? | FK to User (optional) |

---

### TournamentPair
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| tournamentId | String | FK to Tournament |
| name | String? | Pair name |
| type | CategoryType? | Category type |

---

### CategoryMatch
| Field | Type | Description |
|-------|------|-------------|
| id | String (cuid) | Primary key |
| categoryId | String | FK to Category |
| groupId | String? | FK to CategoryGroup |
| round | String | Round identifier |
| matchNumber | Int | Match number |
| status | MatchStatus | Match status |
| score | String? | Score |
| sets | Json? | Set scores |
| winnerId | String? | Winner registration ID |

---

## Enums Reference

```prisma
enum Role { HOST, PLAYER, ADMIN }

enum SessionStatus { PREPARING, IN_PROGRESS, FINISHED }

enum PlayerStatus { WAITING, PLAYING, FINISHED, READY, INACTIVE }

enum CourtStatus { EMPTY, IN_USE, READY }

enum CourtDirection { HORIZONTAL, VERTICAL }

enum MatchStatus { SCHEDULED, IN_PROGRESS, FINISHED, CANCELLED }

enum Gender { MALE, FEMALE, OTHER, PREFER_NOT_TO_SAY }

enum RegistrationStatus { PENDING, APPROVED, REJECTED }

enum TournamentStatus { PREPARING, IN_PROGRESS, FINISHED, CANCELLED }

enum CategoryType { 
  MENS_SINGLE, WOMENS_SINGLE, 
  MENS_DOUBLE, WOMENS_DOUBLE, 
  MIXED_DOUBLE 
}

enum MatchFormat { BEST_OF_1, BEST_OF_3 }
```

---

## Migrations

Run migrations:
```bash
# Push schema to database
pnpm prisma db push

# Generate migration
pnpm prisma migrate dev --name migration_name

# Deploy migrations (production)
pnpm prisma migrate deploy
```

Generate Prisma Client:
```bash
pnpm prisma generate
```
