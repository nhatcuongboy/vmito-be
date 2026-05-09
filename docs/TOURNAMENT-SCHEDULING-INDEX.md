# Tournament Scheduling Documentation Index

## 📚 Tài liệu đầy đủ về hệ thống scheduling cho tournament

---

## 🎯 Bắt đầu nhanh

### Cho người mới
1. **[Quick Start Guide](./SCHEDULE-QUICK-START.md)** ⭐ BẮT ĐẦU TẠI ĐÂY
   - Code examples ngắn gọn
   - Copy-paste ready
   - Common patterns

### Cho người muốn hiểu sâu
2. **[Full Documentation](./TOURNAMENT-SCHEDULING.md)**
   - Schema chi tiết
   - Workflow đầy đủ
   - Best practices
   - Testing checklist

### Cho người thích visual
3. **[Flow Diagrams](./SCHEDULE-FLOW-DIAGRAM.md)**
   - Visual workflows
   - State transitions
   - Data flow diagrams

---

## 📁 File Structure

```
vmito-be/
├── docs/
│   ├── TOURNAMENT-SCHEDULING.md          # Full documentation
│   ├── SCHEDULE-QUICK-START.md           # Quick reference
│   ├── SCHEDULE-FLOW-DIAGRAM.md          # Visual diagrams
│   └── TOURNAMENT-SCHEDULING-INDEX.md    # This file
│
├── src/tournaments/
│   ├── types/
│   │   └── schedule.types.ts             # TypeScript types
│   │
│   ├── services/
│   │   └── schedule.service.ts           # Core scheduling logic
│   │
│   └── controllers/
│       └── schedule.controller.example.ts # Example endpoints
│
├── prisma/
│   ├── schema.prisma                     # Updated schema
│   └── migrations/
│       └── 20260509165550_add_tournament_schedule_fields/
│           └── migration.sql             # Migration file
│
└── MIGRATION_SUMMARY.md                  # Migration summary
```

---

## 🔍 Tìm nhanh

### Tôi muốn...

#### ...hiểu 2 kiểu schedule khác nhau như thế nào?
→ [Full Documentation - Overview](./TOURNAMENT-SCHEDULING.md#overview)

#### ...xem code example để implement?
→ [Quick Start Guide - Cheat Sheet](./SCHEDULE-QUICK-START.md#-cheat-sheet)

#### ...hiểu workflow hoạt động ra sao?
→ [Flow Diagrams - Next Available Court Flow](./SCHEDULE-FLOW-DIAGRAM.md#1-next-available-court-flow)

#### ...biết cần thêm field gì vào database?
→ [Full Documentation - Database Schema](./TOURNAMENT-SCHEDULING.md#database-schema)

#### ...tạo API endpoints?
→ [Example Controller](../src/tournaments/controllers/schedule.controller.example.ts)

#### ...biết đã migrate những gì?
→ [Migration Summary](../MIGRATION_SUMMARY.md)

#### ...xem TypeScript types?
→ [Schedule Types](../src/tournaments/types/schedule.types.ts)

#### ...implement auto-assignment?
→ [Quick Start - Example 1](./SCHEDULE-QUICK-START.md#example-1-auto-scheduling-tournament)

#### ...implement pre-scheduling?
→ [Quick Start - Example 2](./SCHEDULE-QUICK-START.md#example-2-pre-scheduling-tournament)

#### ...detect conflicts?
→ [Schedule Service - detectScheduleConflicts()](../src/tournaments/services/schedule.service.ts)

---

## 📖 Đọc theo thứ tự

### Level 1: Beginner
1. [Quick Start Guide](./SCHEDULE-QUICK-START.md) - 10 phút
2. [Flow Diagrams](./SCHEDULE-FLOW-DIAGRAM.md) - 5 phút
3. Thử implement một example

### Level 2: Intermediate
1. [Full Documentation](./TOURNAMENT-SCHEDULING.md) - 30 phút
2. [Schedule Service](../src/tournaments/services/schedule.service.ts) - Đọc code
3. [Example Controller](../src/tournaments/controllers/schedule.controller.example.ts) - Đọc code
4. Implement API endpoints

### Level 3: Advanced
1. [Migration Summary](../MIGRATION_SUMMARY.md) - Hiểu DB changes
2. [Schedule Types](../src/tournaments/types/schedule.types.ts) - Hiểu type system
3. Implement conflict detection cho players
4. Optimize scheduling algorithm

---

## 🎓 Learning Path

### Path 1: Tôi muốn implement Next Available Court

```
1. Đọc: Quick Start - Next Available Court Mode
   ↓
2. Xem: Flow Diagram - Next Available Court Flow
   ↓
3. Code: Example 1 - Auto-scheduling Tournament
   ↓
4. Test: Add matches to queue → Auto-assign → Release court
   ↓
5. Integrate: Add to your controller
```

### Path 2: Tôi muốn implement Assigned Courts & Times

```
1. Đọc: Quick Start - Assigned Courts & Times Mode
   ↓
2. Xem: Flow Diagram - Assigned Courts & Times Flow
   ↓
3. Code: Example 2 - Pre-scheduling Tournament
   ↓
4. Test: Assign matches → Detect conflicts → Reschedule
   ↓
5. Integrate: Build UI for schedule management
```

---

## 🔧 API Reference

### ScheduleService Methods

| Method | Description | Mode |
|--------|-------------|------|
| `getAvailableCourts()` | Lấy danh sách courts available | Both |
| `getQueuedMatches()` | Lấy matches đang chờ | Next Available |
| `autoAssignNextMatch()` | Auto-assign match tiếp theo | Next Available |
| `releaseCourtAfterMatch()` | Giải phóng court | Next Available |
| `addMatchToQueue()` | Thêm match vào queue | Next Available |
| `removeMatchFromQueue()` | Xóa match khỏi queue | Next Available |
| `reorderQueue()` | Sắp xếp lại queue | Next Available |
| `assignMatchToCourtAndTime()` | Manual assign | Assigned |
| `detectScheduleConflicts()` | Phát hiện conflicts | Assigned |

---

## 💡 Tips & Tricks

### Performance
- Cache court availability status
- Batch queue operations
- Use database transactions for consistency

### UX
- Show real-time queue updates
- Highlight conflicts visually
- Auto-refresh schedule view

### Testing
- Test with multiple courts
- Test with empty queue
- Test conflict scenarios
- Test timezone handling

---

## 🐛 Troubleshooting

### Court không được release sau khi match kết thúc
→ Đảm bảo gọi `releaseCourtAfterMatch()` trong match completion handler

### Auto-assign không hoạt động
→ Check:
1. Tournament có `scheduleType = NEXT_AVAILABLE`?
2. Có matches trong queue (`isQueued = true`)?
3. Có courts available (`status = AVAILABLE`)?

### Conflict detection không chính xác
→ Check:
1. `estimatedEndTime` được tính đúng?
2. Timezone consistent?
3. Buffer time đã được thêm?

---

## 📞 Support

### Cần thêm tính năng?
- Tham khảo [Future Enhancements](./TOURNAMENT-SCHEDULING.md#future-enhancements)
- Mở issue hoặc PR

### Tìm thấy bug?
- Check [Troubleshooting](#-troubleshooting) trước
- Đọc [Testing Checklist](./TOURNAMENT-SCHEDULING.md#testing-checklist)
- Report với reproduction steps

### Có câu hỏi?
- Đọc lại docs
- Check example code
- Review flow diagrams

---

## 🚀 Next Steps

1. ✅ Schema đã được migrate
2. ✅ Service đã được implement
3. ⏳ Tạo controller endpoints
4. ⏳ Implement frontend UI
5. ⏳ Add notifications
6. ⏳ Write tests

---

## 📝 Changelog

### 2026-05-09
- ✅ Initial implementation
- ✅ Database migration
- ✅ ScheduleService created
- ✅ Full documentation
- ✅ Example code

---

**Happy Scheduling! 🎾**
