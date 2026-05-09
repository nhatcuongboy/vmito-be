# Tournament Scheduling System

## Overview

Hệ thống scheduling cho tournament hỗ trợ 2 chế độ:

1. **Next Available Court** - Tự động assign match vào court trống khi có kết quả
2. **Assigned Courts & Times** - Pre-assign court và thời gian cụ thể cho từng match

---

## Database Schema

### Enums

```prisma
enum ScheduleType {
  NEXT_AVAILABLE  // Auto-assign mode
  ASSIGNED        // Manual pre-assign mode
}

enum TournamentCourtStatus {
  AVAILABLE    // Court đang trống
  OCCUPIED     // Court đang có match
  MAINTENANCE  // Court đang bảo trì
}
```

### Tournament Model

```prisma
model Tournament {
  scheduleType ScheduleType?  // Chọn kiểu schedule
  // ...
}
```

### CategoryMatch Model

```prisma
model CategoryMatch {
  // Existing fields
  courtId      String?
  startTime    DateTime?
  status       MatchStatus
  
  // Schedule management fields
  queueOrder         Int?       // Thứ tự trong queue (Next Available mode)
  isQueued           Boolean    // Đang chờ court assignment
  scheduledDuration  Int?       // Dự kiến match kéo dài (phút)
  estimatedEndTime   DateTime?  // Thời gian kết thúc dự kiến
  autoAssignedAt     DateTime?  // Khi nào được auto-assign
  assignedBy         String?    // "AUTO" hoặc userId
}
```

### TournamentCourt Model

```prisma
model TournamentCourt {
  status         TournamentCourtStatus  // Trạng thái court
  currentMatchId String?                // Match đang chơi
  currentMatch   CategoryMatch?         // Relation
}
```

---

## Usage Guide

### 1. Next Available Court Mode

#### Setup Tournament

```typescript
// Tạo tournament với Next Available mode
const tournament = await prisma.tournament.create({
  data: {
    name: 'Summer Championship',
    scheduleType: ScheduleType.NEXT_AVAILABLE,
    // ...
  },
});
```

#### Add Matches to Queue

```typescript
// Thêm match vào queue
await scheduleService.addMatchToQueue(matchId);

// Hoặc chỉ định thứ tự cụ thể
await scheduleService.addMatchToQueue(matchId, 5);
```

#### Auto-assign When Court Available

```typescript
// Khi match kết thúc, tự động assign match tiếp theo
const result = await scheduleService.autoAssignNextMatch(tournamentId);

if (result.success) {
  console.log(`Match ${result.matchId} assigned to court ${result.courtId}`);
} else {
  console.log(`Failed: ${result.error}`);
}
```

#### Release Court After Match

```typescript
// Khi match kết thúc, giải phóng court
await scheduleService.releaseCourtAfterMatch(matchId);

// Sau đó tự động assign match tiếp theo
await scheduleService.autoAssignNextMatch(tournamentId);
```

#### Get Queue Status

```typescript
// Xem danh sách matches đang chờ
const queuedMatches = await scheduleService.getQueuedMatches(tournamentId);

// Xem courts đang available
const availableCourts = await scheduleService.getAvailableCourts(tournamentId);
```

#### Reorder Queue

```typescript
// Sắp xếp lại thứ tự queue
const newOrder = ['match-id-1', 'match-id-2', 'match-id-3'];
await scheduleService.reorderQueue(newOrder);
```

---

### 2. Assigned Courts & Times Mode

#### Setup Tournament

```typescript
// Tạo tournament với Assigned mode
const tournament = await prisma.tournament.create({
  data: {
    name: 'Winter Championship',
    scheduleType: ScheduleType.ASSIGNED,
    // ...
  },
});
```

#### Assign Match to Court & Time

```typescript
// Pre-assign match vào court và thời gian cụ thể
await scheduleService.assignMatchToCourtAndTime({
  matchId: 'match-123',
  courtId: 'court-1',
  startTime: new Date('2026-05-10T09:00:00'),
  estimatedEndTime: new Date('2026-05-10T09:30:00'),
  duration: 30, // minutes
});
```

#### Detect Conflicts

```typescript
// Kiểm tra conflict trước khi assign
const conflicts = await scheduleService.detectScheduleConflicts({
  matchId: 'match-123',
  courtId: 'court-1',
  startTime: new Date('2026-05-10T09:00:00'),
  estimatedEndTime: new Date('2026-05-10T09:30:00'),
  duration: 30,
});

if (conflicts.length > 0) {
  console.log('Conflicts detected:', conflicts);
}
```

#### Reschedule Match

```typescript
// Thay đổi court hoặc time
await scheduleService.assignMatchToCourtAndTime({
  matchId: 'match-123',
  courtId: 'court-2', // Đổi court
  startTime: new Date('2026-05-10T10:00:00'), // Đổi giờ
  estimatedEndTime: new Date('2026-05-10T10:30:00'),
  duration: 30,
});
```

---

## Workflow Examples

### Next Available Court Workflow

```
1. Tournament starts
   ↓
2. Add all Round 1 matches to queue
   ↓
3. Auto-assign first N matches to N courts
   ↓
4. When match finishes:
   - Release court
   - Auto-assign next match in queue
   ↓
5. Repeat until all matches done
```

### Assigned Courts & Times Workflow

```
1. Tournament setup
   ↓
2. Organizer creates schedule:
   - Match 1: Court 1, 9:00-9:30
   - Match 2: Court 2, 9:00-9:30
   - Match 3: Court 1, 9:30-10:00
   ↓
3. System validates (no conflicts)
   ↓
4. Publish schedule to players
   ↓
5. Organizer can reschedule if needed
```

---

## API Endpoints (Suggested)

### Next Available Court

```
POST   /tournaments/:id/schedule/queue/add
DELETE /tournaments/:id/schedule/queue/remove/:matchId
PUT    /tournaments/:id/schedule/queue/reorder
POST   /tournaments/:id/schedule/auto-assign
POST   /tournaments/:id/matches/:matchId/release-court
GET    /tournaments/:id/schedule/queue
GET    /tournaments/:id/schedule/courts/available
```

### Assigned Courts & Times

```
POST   /tournaments/:id/schedule/assign
PUT    /tournaments/:id/schedule/assign/:matchId
POST   /tournaments/:id/schedule/validate
GET    /tournaments/:id/schedule/conflicts
GET    /tournaments/:id/schedule
```

---

## Best Practices

### Next Available Court

1. **Set realistic match durations** - Dùng `scheduledDuration` để estimate khi nào court available
2. **Prioritize important matches** - Dùng `queueOrder` để ưu tiên finals, semifinals
3. **Monitor queue** - Hiển thị queue status cho organizer
4. **Auto-trigger** - Tự động gọi `autoAssignNextMatch()` khi match kết thúc

### Assigned Courts & Times

1. **Validate before publish** - Luôn check conflicts trước khi publish schedule
2. **Buffer time** - Thêm 5-10 phút buffer giữa các matches
3. **Notify players** - Gửi notification khi schedule thay đổi
4. **Allow flexibility** - Cho phép organizer reschedule nếu cần

---

## Migration

Migration đã được apply với các thay đổi:

```sql
-- Add enum
CREATE TYPE "TournamentCourtStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'MAINTENANCE');

-- Add fields to CategoryMatch
ALTER TABLE "category_matches" ADD COLUMN "queueOrder" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "isQueued" BOOLEAN DEFAULT false;
ALTER TABLE "category_matches" ADD COLUMN "scheduledDuration" INTEGER;
ALTER TABLE "category_matches" ADD COLUMN "estimatedEndTime" TIMESTAMP(3);
ALTER TABLE "category_matches" ADD COLUMN "autoAssignedAt" TIMESTAMP(3);
ALTER TABLE "category_matches" ADD COLUMN "assignedBy" TEXT;

-- Add fields to TournamentCourt
ALTER TABLE "tournament_courts" ADD COLUMN "status" "TournamentCourtStatus" DEFAULT 'AVAILABLE';
ALTER TABLE "tournament_courts" ADD COLUMN "currentMatchId" TEXT UNIQUE;
```

---

## Testing Checklist

### Next Available Court

- [ ] Add match to queue
- [ ] Auto-assign to available court
- [ ] Release court after match
- [ ] Handle no available courts
- [ ] Handle empty queue
- [ ] Reorder queue
- [ ] Multiple courts working simultaneously

### Assigned Courts & Times

- [ ] Assign match to court & time
- [ ] Detect court overlap conflict
- [ ] Detect player overlap conflict
- [ ] Reschedule match
- [ ] Validate full tournament schedule
- [ ] Handle timezone correctly

---

## Future Enhancements

1. **Smart scheduling algorithm** - Tối ưu schedule để minimize wait time
2. **Player availability** - Check player có available không trước khi assign
3. **Court preferences** - Cho phép specify court preferences
4. **Break times** - Tự động thêm break giữa các rounds
5. **Notifications** - Tự động notify players khi match sắp bắt đầu
6. **Analytics** - Track average match duration, court utilization
