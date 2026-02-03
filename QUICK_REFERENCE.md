# Bulk Session Creation - Quick Reference Card 🚀

## Endpoint
```
POST http://localhost:3000/sessions/bulk
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

## Three Modes

### 1️⃣ Single Mode
Creates one session (same as POST /sessions).
```json
{
  "mode": "single",
  "baseSession": { /* session data */ }
}
```
**Result:** 1 session

---

### 2️⃣ Specific Dates Mode
Clone session to specific dates.
```json
{
  "mode": "specific-dates",
  "baseSession": {
    "name": "Weekly Game",
    "startTime": "2024-02-05T18:00:00Z",
    "endTime": "2024-02-05T20:00:00Z",
    ...
  },
  "specificDates": {
    "dates": [
      "2024-02-12T00:00:00Z",
      "2024-02-19T00:00:00Z"
    ]
  }
}
```
**Result:** 3 sessions (base + 2 clones)
- Feb 5 at 18:00-20:00 (base)
- Feb 12 at 18:00-20:00 (clone)
- Feb 19 at 18:00-20:00 (clone)

---

### 3️⃣ Recurring Weekdays Mode
Auto-generate sessions for specific weekdays.
```json
{
  "mode": "recurring-weekdays",
  "baseSession": {
    "name": "MWF Sessions",
    "startTime": "2024-02-05T18:00:00Z",
    "endTime": "2024-02-05T20:00:00Z",
    ...
  },
  "recurringWeekdays": {
    "weekdays": [1, 3, 5],
    "numberOfWeeks": 2
  }
}
```
**Weekdays:** 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

**Result:** 6 sessions
- Week 1: Mon 2/5, Wed 2/7, Fri 2/9
- Week 2: Mon 2/12, Wed 2/14, Fri 2/16

All at 18:00-20:00

---

## Quick Test

### Get JWT Token
```bash
# Login first, then extract token
TOKEN="your_jwt_token_here"
```

### Run Test Script
```bash
./test-bulk-sessions.sh "$TOKEN"
```

### Manual cURL Test
```bash
curl -X POST http://localhost:3000/sessions/bulk \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @test-payload.json | jq '.'
```

---

## Response Format

### Success
```json
{
  "success": true,
  "sessionsCreated": 4,
  "sessions": [
    { "id": "...", "name": "...", ... }
  ],
  "errors": []
}
```

### Error
```json
{
  "statusCode": 400,
  "message": "Failed to create bulk sessions: ...",
  "error": "Bad Request"
}
```

---

## Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Missing/invalid JWT | Check token |
| 400 Bad Request | Invalid mode | Use 'single', 'specific-dates', or 'recurring-weekdays' |
| 400 Missing dates | Mode is 'specific-dates' but no dates provided | Add specificDates.dates array |
| 400 Missing weekdays | Mode is 'recurring-weekdays' but no config | Add recurringWeekdays config |
| 400 Invalid weekday | Weekday not 0-6 | Use valid weekday numbers |
| 400 Invalid weeks | numberOfWeeks not 1-52 | Use valid range |

---

## Validation Rules

### specificDates
- ✅ Array of ISO date strings
- ✅ At least 1 date required
- ✅ Dates in the future (recommended)

### recurringWeekdays
- ✅ weekdays: Array of numbers 0-6
- ✅ At least 1 weekday required
- ✅ numberOfWeeks: 1-52
- ✅ startDate: Optional ISO string

### baseSession
- ✅ Same validation as POST /sessions
- ✅ All required fields must be present

---

## Key Features

✅ **All-or-Nothing** - Transaction-based, no partial commits
✅ **Time Preserved** - Hours:minutes stay same across dates
✅ **No Duplicates** - Base date filtered in recurring mode
✅ **Full Support** - Venues, courts, fees all copied
✅ **JWT Required** - Same auth as single session creation

---

## Performance

| Batch Size | Performance | Recommendation |
|------------|-------------|----------------|
| 1-20 sessions | Excellent | ✅ Use freely |
| 20-50 sessions | Good | ✅ Monitor |
| 50+ sessions | Slower | ⚠️ Consider chunking |

Each session ~6-8 DB queries within one transaction.

---

## Files

📄 **Full Docs:** [BULK_SESSION_IMPLEMENTATION.md](BULK_SESSION_IMPLEMENTATION.md)
📄 **Summary:** [BULK_SESSION_SUMMARY.md](BULK_SESSION_SUMMARY.md)
🧪 **Test Script:** [test-bulk-sessions.sh](test-bulk-sessions.sh)
💾 **DTO:** [src/sessions/dto/bulk-session.dto.ts](src/sessions/dto/bulk-session.dto.ts)
💾 **Service:** [src/sessions/sessions.service.ts](src/sessions/sessions.service.ts) (line ~1800)
💾 **Controller:** [src/sessions/sessions.controller.ts](src/sessions/sessions.controller.ts) (line ~101)

---

## Need Help?

1. Check error message
2. Review this quick reference
3. Read full docs (BULK_SESSION_IMPLEMENTATION.md)
4. Run test script to verify setup
5. Check server logs
