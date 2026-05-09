# Tournament Scheduling - Quick Start Guide

## 🚀 Bắt đầu nhanh

### 1. Import Service

```typescript
import { ScheduleService } from './tournaments/services/schedule.service';
```

### 2. Inject vào Controller/Service

```typescript
constructor(private scheduleService: ScheduleService) {}
```

---

## 📋 Cheat Sheet

### Next Available Court Mode

```typescript
// 1. Thêm matches vào queue
await scheduleService.addMatchToQueue(matchId);

// 2. Auto-assign match đầu tiên
const result = await scheduleService.autoAssignNextMatch(tournamentId);

// 3. Khi match kết thúc
await scheduleService.releaseCourtAfterMatch(matchId);
await scheduleService.autoAssignNextMatch(tournamentId); // Assign next

// 4. Xem queue status
const queue = await scheduleService.getQueuedMatches(tournamentId);
const courts = await scheduleService.getAvailableCourts(tournamentId);

// 5. Reorder queue
await scheduleService.reorderQueue(['match-1', 'match-2', 'match-3']);
```

### Assigned Courts & Times Mode

```typescript
// 1. Assign match vào court và time
await scheduleService.assignMatchToCourtAndTime({
  matchId: 'match-123',
  courtId: 'court-1',
  startTime: new Date('2026-05-10T09:00:00'),
  estimatedEndTime: new Date('2026-05-10T09:30:00'),
  duration: 30,
});

// 2. Check conflicts trước khi assign
const conflicts = await scheduleService.detectScheduleConflicts({
  matchId: 'match-123',
  courtId: 'court-1',
  startTime: new Date('2026-05-10T09:00:00'),
  estimatedEndTime: new Date('2026-05-10T09:30:00'),
  duration: 30,
});

if (conflicts.length === 0) {
  // Safe to assign
}

// 3. Reschedule
await scheduleService.assignMatchToCourtAndTime({
  matchId: 'match-123',
  courtId: 'court-2', // New court
  startTime: new Date('2026-05-10T10:00:00'), // New time
  estimatedEndTime: new Date('2026-05-10T10:30:00'),
  duration: 30,
});
```

---

## 🔄 Complete Workflow Examples

### Example 1: Auto-scheduling Tournament

```typescript
async function runAutoScheduledTournament(tournamentId: string) {
  // Step 1: Get all Round 1 matches
  const round1Matches = await prisma.categoryMatch.findMany({
    where: {
      category: { tournamentId },
      round: 'Round 1',
    },
  });

  // Step 2: Add all to queue
  for (const match of round1Matches) {
    await scheduleService.addMatchToQueue(match.id);
  }

  // Step 3: Get available courts
  const courts = await scheduleService.getAvailableCourts(tournamentId);

  // Step 4: Auto-assign first N matches (N = number of courts)
  for (let i = 0; i < courts.length; i++) {
    await scheduleService.autoAssignNextMatch(tournamentId);
  }

  // Step 5: When match finishes (call this in your match completion handler)
  // await scheduleService.releaseCourtAfterMatch(matchId);
  // await scheduleService.autoAssignNextMatch(tournamentId);
}
```

### Example 2: Pre-scheduling Tournament

```typescript
async function createTournamentSchedule(tournamentId: string) {
  const matches = await prisma.categoryMatch.findMany({
    where: { category: { tournamentId } },
    orderBy: [{ round: 'asc' }, { matchNumber: 'asc' }],
  });

  const courts = await prisma.tournamentCourt.findMany({
    where: { tournamentId },
  });

  let currentTime = new Date('2026-05-10T09:00:00');
  let courtIndex = 0;

  for (const match of matches) {
    const assignment = {
      matchId: match.id,
      courtId: courts[courtIndex].id,
      startTime: currentTime,
      estimatedEndTime: new Date(currentTime.getTime() + 30 * 60000),
      duration: 30,
    };

    // Check conflicts
    const conflicts = await scheduleService.detectScheduleConflicts(assignment);

    if (conflicts.length === 0) {
      await scheduleService.assignMatchToCourtAndTime(assignment);
    } else {
      console.log(`Conflict for match ${match.id}:`, conflicts);
      // Handle conflict (try different court or time)
    }

    // Move to next court
    courtIndex = (courtIndex + 1) % courts.length;

    // If we've cycled through all courts, advance time
    if (courtIndex === 0) {
      currentTime = new Date(currentTime.getTime() + 30 * 60000);
    }
  }
}
```

### Example 3: Match Completion Handler

```typescript
async function handleMatchCompletion(matchId: string, tournamentId: string) {
  // Update match status
  await prisma.categoryMatch.update({
    where: { id: matchId },
    data: {
      status: MatchStatus.FINISHED,
      endTime: new Date(),
    },
  });

  // Get tournament schedule type
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { scheduleType: true },
  });

  // If Next Available mode, auto-assign next match
  if (tournament?.scheduleType === ScheduleType.NEXT_AVAILABLE) {
    await scheduleService.releaseCourtAfterMatch(matchId);
    const result = await scheduleService.autoAssignNextMatch(tournamentId);

    if (result.success) {
      // Notify players of next match
      console.log(`Next match ${result.matchId} assigned to court ${result.courtId}`);
    }
  }
}
```

---

## 🎯 Common Patterns

### Pattern 1: Bulk Queue Setup

```typescript
async function setupQueue(tournamentId: string, round: string) {
  const matches = await prisma.categoryMatch.findMany({
    where: {
      category: { tournamentId },
      round,
    },
    orderBy: { matchNumber: 'asc' },
  });

  for (let i = 0; i < matches.length; i++) {
    await scheduleService.addMatchToQueue(matches[i].id, i + 1);
  }
}
```

### Pattern 2: Priority Queue

```typescript
async function prioritizeMatch(matchId: string) {
  // Move match to front of queue
  await scheduleService.addMatchToQueue(matchId, 1);

  // Reorder other matches
  const queue = await scheduleService.getQueuedMatches(tournamentId);
  const otherMatches = queue.filter((m) => m.matchId !== matchId);
  const newOrder = [matchId, ...otherMatches.map((m) => m.matchId)];

  await scheduleService.reorderQueue(newOrder);
}
```

### Pattern 3: Smart Scheduling with Buffer

```typescript
async function scheduleWithBuffer(
  matchId: string,
  courtId: string,
  startTime: Date,
  duration: number,
  bufferMinutes: number = 5,
) {
  const totalDuration = duration + bufferMinutes;

  await scheduleService.assignMatchToCourtAndTime({
    matchId,
    courtId,
    startTime,
    estimatedEndTime: new Date(startTime.getTime() + totalDuration * 60000),
    duration: totalDuration,
  });
}
```

---

## ⚠️ Common Pitfalls

### ❌ Don't: Forget to release court

```typescript
// BAD
await prisma.categoryMatch.update({
  where: { id: matchId },
  data: { status: MatchStatus.FINISHED },
});
// Court is still OCCUPIED!
```

### ✅ Do: Always release court

```typescript
// GOOD
await scheduleService.releaseCourtAfterMatch(matchId);
await scheduleService.autoAssignNextMatch(tournamentId);
```

### ❌ Don't: Assign without checking conflicts

```typescript
// BAD
await scheduleService.assignMatchToCourtAndTime(assignment);
// Might have conflicts!
```

### ✅ Do: Always validate first

```typescript
// GOOD
const conflicts = await scheduleService.detectScheduleConflicts(assignment);
if (conflicts.length === 0) {
  await scheduleService.assignMatchToCourtAndTime(assignment);
} else {
  throw new BadRequestException('Schedule conflicts detected');
}
```

---

## 📞 Need Help?

- Full docs: `/docs/TOURNAMENT-SCHEDULING.md`
- Migration summary: `/MIGRATION_SUMMARY.md`
- Example controller: `/src/tournaments/controllers/schedule.controller.example.ts`
- Types reference: `/src/tournaments/types/schedule.types.ts`
