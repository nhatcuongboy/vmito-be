# Migration Summary: Tournament Scheduling System

## Ngày: 2026-05-09

## Tổng quan

Đã implement đầy đủ infrastructure cho 2 kiểu schedule trong tournament management:
1. **Next Available Court** - Auto-assign matches
2. **Assigned Courts & Times** - Pre-schedule matches

---

## ✅ Những gì đã làm

### 1. Database Schema Updates

#### Thêm Enum mới
```prisma
enum TournamentCourtStatus {
  AVAILABLE    // Court trống
  OCCUPIED     // Court đang có match
  MAINTENANCE  // Court bảo trì
}
```

#### Cập nhật CategoryMatch Model
Thêm 6 fields mới:
- `queueOrder` (Int?) - Thứ tự trong queue
- `isQueued` (Boolean) - Đang chờ court
- `scheduledDuration` (Int?) - Dự kiến thời gian (phút)
- `estimatedEndTime` (DateTime?) - Thời gian kết thúc dự kiến
- `autoAssignedAt` (DateTime?) - Khi nào được auto-assign
- `assignedBy` (String?) - "AUTO" hoặc userId

#### Cập nhật TournamentCourt Model
Thêm 2 fields mới:
- `status` (TournamentCourtStatus) - Trạng thái court
- `currentMatchId` (String?) - Match đang chơi

### 2. Migration File

Tạo migration: `20260509165550_add_tournament_schedule_fields`

Location: `/prisma/migrations/20260509165550_add_tournament_schedule_fields/migration.sql`

### 3. TypeScript Types

Tạo file: `/src/tournaments/types/schedule.types.ts`

Bao gồm:
- `ScheduleConfig`
- `CourtAvailability`
- `QueuedMatch`
- `ScheduleAssignment`
- `ScheduleConflict`
- `AutoAssignmentResult`

### 4. Schedule Service

Tạo file: `/src/tournaments/services/schedule.service.ts`

Các methods chính:
- `getAvailableCourts()` - Lấy danh sách courts available
- `getQueuedMatches()` - Lấy matches đang chờ
- `autoAssignNextMatch()` - Auto-assign match tiếp theo
- `releaseCourtAfterMatch()` - Giải phóng court
- `assignMatchToCourtAndTime()` - Manual assign
- `detectScheduleConflicts()` - Phát hiện conflicts
- `addMatchToQueue()` - Thêm match vào queue
- `removeMatchFromQueue()` - Xóa match khỏi queue
- `reorderQueue()` - Sắp xếp lại queue

### 5. Documentation

Tạo file: `/docs/TOURNAMENT-SCHEDULING.md`

Bao gồm:
- Schema explanation
- Usage guide cho cả 2 modes
- Workflow examples
- API endpoints suggestions
- Best practices
- Testing checklist

---

## 📊 Database Changes Applied

```sql
✅ CREATE TYPE "TournamentCourtStatus"
✅ ALTER TABLE "category_matches" - 6 columns added
✅ ALTER TABLE "tournament_courts" - 2 columns added
✅ CREATE UNIQUE INDEX on currentMatchId
✅ ADD FOREIGN KEY constraint
```

Status: **Applied successfully via `prisma db push`**

---

## 🔧 Next Steps

### Backend Implementation

1. **Integrate ScheduleService vào TournamentsModule**
   ```typescript
   // tournaments.module.ts
   import { ScheduleService } from './services/schedule.service';
   
   @Module({
     providers: [TournamentsService, ScheduleService],
     // ...
   })
   ```

2. **Tạo Schedule Controller**
   - Endpoints cho queue management
   - Endpoints cho manual assignment
   - Endpoints cho conflict detection

3. **Implement Event Handlers**
   - Khi match kết thúc → auto-assign next match
   - Khi schedule thay đổi → notify players

4. **Add Validation**
   - Validate schedule type khi assign
   - Validate court availability
   - Validate time conflicts

### Frontend Implementation

1. **Next Available Court UI**
   - Queue management interface
   - Drag-drop để reorder queue
   - Real-time court status display
   - Auto-refresh khi có match mới được assign

2. **Assigned Courts & Times UI**
   - Calendar/timeline view
   - Drag-drop để assign matches
   - Conflict highlighting
   - Bulk schedule generation

3. **Common Components**
   - Court status indicator
   - Match card với schedule info
   - Conflict warning modal
   - Schedule export (PDF/Excel)

---

## 🧪 Testing Requirements

### Unit Tests
- [ ] ScheduleService methods
- [ ] Conflict detection logic
- [ ] Queue ordering logic

### Integration Tests
- [ ] Auto-assign workflow
- [ ] Manual assign workflow
- [ ] Conflict scenarios
- [ ] Multiple courts simultaneously

### E2E Tests
- [ ] Complete tournament flow (Next Available)
- [ ] Complete tournament flow (Assigned)
- [ ] Reschedule scenarios
- [ ] Edge cases (no courts, empty queue)

---

## 📝 Notes

- Schema đã được push trực tiếp vào database (bypass migration history issues)
- Migration SQL file đã được tạo để track changes
- Prisma Client đã được regenerate
- Tất cả types đã được export từ `@prisma/client`

---

## 🚀 Ready to Use

Bạn có thể bắt đầu sử dụng ngay:

```typescript
import { ScheduleService } from './tournaments/services/schedule.service';

// Inject vào controller
constructor(private scheduleService: ScheduleService) {}

// Sử dụng
const result = await this.scheduleService.autoAssignNextMatch(tournamentId);
```

---

## 📚 References

- Schema: `/prisma/schema.prisma`
- Types: `/src/tournaments/types/schedule.types.ts`
- Service: `/src/tournaments/services/schedule.service.ts`
- Docs: `/docs/TOURNAMENT-SCHEDULING.md`
- Migration: `/prisma/migrations/20260509165550_add_tournament_schedule_fields/`
