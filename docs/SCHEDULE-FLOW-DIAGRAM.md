# Tournament Scheduling Flow Diagrams

## 1. Next Available Court Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TOURNAMENT STARTS                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Setup: Add all Round 1 matches to queue                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Match 1  │  │ Match 2  │  │ Match 3  │  │ Match 4  │   │
│  │ Order: 1 │  │ Order: 2 │  │ Order: 3 │  │ Order: 4 │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Auto-assign first N matches (N = number of courts)         │
│                                                              │
│  Court 1: Match 1 ──► [OCCUPIED]                            │
│  Court 2: Match 2 ──► [OCCUPIED]                            │
│  Court 3: [AVAILABLE]                                       │
│                                                              │
│  Queue: Match 3, Match 4 (waiting)                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   MATCH 1 FINISHES                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Release Court 1                                          │
│     Court 1: [AVAILABLE]                                     │
│                                                              │
│  2. Auto-assign next match in queue                          │
│     Court 1: Match 3 ──► [OCCUPIED]                          │
│                                                              │
│  3. Update queue                                             │
│     Queue: Match 4 (waiting)                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   REPEAT UNTIL DONE                          │
│                                                              │
│  When all matches finish:                                    │
│  - All courts: [AVAILABLE]                                   │
│  - Queue: empty                                              │
│  - Tournament: FINISHED                                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Assigned Courts & Times Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    TOURNAMENT SETUP                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Organizer creates schedule                                  │
│                                                              │
│  Timeline:                                                   │
│  09:00 ─────────────────────────────────────────────────    │
│         │ Court 1: Match 1 │ Court 2: Match 2 │            │
│  09:30 ─────────────────────────────────────────────────    │
│         │ Court 1: Match 3 │ Court 2: Match 4 │            │
│  10:00 ─────────────────────────────────────────────────    │
│         │ Court 1: Match 5 │ Court 2: Match 6 │            │
│  10:30 ─────────────────────────────────────────────────    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Validate schedule (check conflicts)                         │
│                                                              │
│  ✅ No court overlaps                                        │
│  ✅ No player overlaps                                       │
│  ✅ All matches have court & time                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Publish schedule to players                                 │
│                                                              │
│  Player A:                                                   │
│  - Match 1: Court 1, 09:00                                   │
│  - Match 5: Court 1, 10:00                                   │
│                                                              │
│  Player B:                                                   │
│  - Match 2: Court 2, 09:00                                   │
│  - Match 3: Court 1, 09:30                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Tournament day: Follow schedule                             │
│                                                              │
│  09:00 - Match 1 & 2 start                                   │
│  09:30 - Match 3 & 4 start                                   │
│  10:00 - Match 5 & 6 start                                   │
│                                                              │
│  If delay: Organizer can reschedule remaining matches        │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow: Auto-Assignment

```
┌──────────────────┐
│  Match Finishes  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  releaseCourtAfterMatch(matchId)                             │
│                                                              │
│  1. Find match's court                                       │
│  2. Update court:                                            │
│     - status: AVAILABLE                                      │
│     - currentMatchId: null                                   │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  autoAssignNextMatch(tournamentId)                           │
│                                                              │
│  1. Find first AVAILABLE court                               │
│     ┌──────────────────────────────────────┐                │
│     │ SELECT * FROM tournament_courts      │                │
│     │ WHERE status = 'AVAILABLE'           │                │
│     │ ORDER BY courtNumber ASC             │                │
│     │ LIMIT 1                              │                │
│     └──────────────────────────────────────┘                │
│                                                              │
│  2. Find next queued match                                   │
│     ┌──────────────────────────────────────┐                │
│     │ SELECT * FROM category_matches       │                │
│     │ WHERE isQueued = true                │                │
│     │   AND courtId IS NULL                │                │
│     │ ORDER BY queueOrder ASC              │                │
│     │ LIMIT 1                              │                │
│     └──────────────────────────────────────┘                │
│                                                              │
│  3. Assign match to court (transaction)                      │
│     ┌──────────────────────────────────────┐                │
│     │ UPDATE category_matches              │                │
│     │ SET courtId = ?,                     │                │
│     │     startTime = NOW(),               │                │
│     │     autoAssignedAt = NOW(),          │                │
│     │     assignedBy = 'AUTO',             │                │
│     │     isQueued = false                 │                │
│     │                                      │                │
│     │ UPDATE tournament_courts             │                │
│     │ SET status = 'OCCUPIED',             │                │
│     │     currentMatchId = ?               │                │
│     └──────────────────────────────────────┘                │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Return Result   │
│  - matchId       │
│  - courtId       │
│  - assignedAt    │
└──────────────────┘
```

---

## 4. Data Flow: Manual Assignment with Conflict Detection

```
┌──────────────────────────────────────────┐
│  Organizer assigns match                 │
│  - Match 5                               │
│  - Court 1                               │
│  - 10:00 - 10:30                         │
└────────┬─────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  detectScheduleConflicts(assignment)                         │
│                                                              │
│  1. Check court overlap                                      │
│     ┌──────────────────────────────────────┐                │
│     │ SELECT * FROM category_matches       │                │
│     │ WHERE courtId = 'court-1'            │                │
│     │   AND id != 'match-5'                │                │
│     │   AND (                              │                │
│     │     (startTime <= 10:00 AND          │                │
│     │      estimatedEndTime >= 10:00)      │                │
│     │     OR                               │                │
│     │     (startTime <= 10:30 AND          │                │
│     │      estimatedEndTime >= 10:30)      │                │
│     │     OR                               │                │
│     │     (startTime >= 10:00 AND          │                │
│     │      estimatedEndTime <= 10:30)      │                │
│     │   )                                  │                │
│     └──────────────────────────────────────┘                │
│                                                              │
│  2. Check player overlap (TODO)                              │
│     - Get participants of Match 5                            │
│     - Find other matches with same participants              │
│     - Check time overlap                                     │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  If conflicts found:                                         │
│  ❌ Throw BadRequestException                                │
│     { conflicts: [...] }                                     │
│                                                              │
│  If no conflicts:                                            │
│  ✅ Proceed to assignment                                    │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│  assignMatchToCourtAndTime(assignment)                       │
│                                                              │
│  UPDATE category_matches                                     │
│  SET courtId = 'court-1',                                    │
│      startTime = '10:00',                                    │
│      scheduledDuration = 30,                                 │
│      estimatedEndTime = '10:30',                             │
│      assignedBy = 'user-123'                                 │
│  WHERE id = 'match-5'                                        │
└────────┬────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│  Success         │
└──────────────────┘
```

---

## 5. State Transitions

### Court Status

```
[AVAILABLE] ──► [OCCUPIED] ──► [AVAILABLE]
     │              │               │
     │              │               │
     └──────────────┴───────────────┴──► [MAINTENANCE]
```

### Match Status (with scheduling)

```
[SCHEDULED] ──► [IN_PROGRESS] ──► [FINISHED]
     │                                  │
     │                                  │
     └──────────────────────────────────┴──► [CANCELLED]
```

### Match Queue Status

```
Not in queue ──► [isQueued: true] ──► Assigned to court ──► [isQueued: false]
                      │
                      │ (can reorder)
                      ▼
                 [queueOrder: N]
```

---

## 6. Database Relations

```
Tournament
    │
    ├─► TournamentCourt
    │       │
    │       ├─► status: TournamentCourtStatus
    │       └─► currentMatchId ──► CategoryMatch
    │
    └─► Category
            │
            └─► CategoryMatch
                    │
                    ├─► courtId ──► TournamentCourt
                    ├─► startTime
                    ├─► scheduledDuration
                    ├─► estimatedEndTime
                    ├─► queueOrder
                    ├─► isQueued
                    ├─► autoAssignedAt
                    └─► assignedBy
```

---

## Legend

```
┌─────┐
│ Box │  = Process/State
└─────┘

  │
  ▼     = Flow direction

──►     = Transition

✅      = Success/Valid
❌      = Error/Invalid
```
