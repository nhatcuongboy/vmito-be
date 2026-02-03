# Bulk Session Creation - Backend Implementation

## Overview
Backend API endpoint for creating multiple sessions at once has been successfully implemented.

## Implementation Summary

### 1. DTOs (Data Transfer Objects)
**File:** [src/sessions/dto/bulk-session.dto.ts](src/sessions/dto/bulk-session.dto.ts)

```typescript
export enum BulkCreationMode {
  SINGLE = 'single',
  SPECIFIC_DATES = 'specific-dates',
  RECURRING_WEEKDAYS = 'recurring-weekdays',
}

export class BulkSessionCreationDto {
  mode: BulkCreationMode;
  baseSession: CreateSessionDto;
  specificDates?: SpecificDatesConfigDto;
  recurringWeekdays?: RecurringWeekdaysConfigDto;
}
```

**Validation:**
- `mode`: Must be one of the enum values
- `baseSession`: Full session data (validated by existing `CreateSessionDto`)
- `specificDates.dates`: Array of ISO date strings (required if mode is 'specific-dates')
- `recurringWeekdays.weekdays`: Array of numbers 0-6 (required if mode is 'recurring-weekdays')
- `recurringWeekdays.numberOfWeeks`: Number between 1-52

### 2. Service Layer
**File:** [src/sessions/sessions.service.ts](src/sessions/sessions.service.ts)

**New Methods:**

#### `createBulkSessions(bulkDto, hostId)`
Main method for bulk creation. Uses Prisma transaction for all-or-nothing semantics.

**Logic by Mode:**
- **single**: Creates one session using `createSessionInternal`
- **specific-dates**: Creates base session + clones for each date
- **recurring-weekdays**: Creates base session + calculates and creates recurring sessions

#### `createSessionInternal(createSessionDto, hostId, tx?)`
Private method that encapsulates session creation logic. Can run inside or outside a transaction.
- Extracted from original `create()` method
- Handles venue creation/lookup
- Creates session, courts, and fee config
- Returns full session with all relations

#### `cloneSessionWithNewDate(baseSession, newDate)`
Clones session data preserving time (hours:minutes) while changing the date.

#### `calculateRecurringDates(startDate, weekdays, numberOfWeeks)`
Calculates all dates for recurring sessions based on weekdays and number of weeks.

#### `formatDateOnly(date)`
Utility to format date as YYYY-MM-DD for comparison (avoid duplicates).

### 3. Controller Layer
**File:** [src/sessions/sessions.controller.ts](src/sessions/sessions.controller.ts)

**New Endpoint:**
```typescript
@Post('bulk')
async createBulkSessions(
  @Body() bulkSessionDto: BulkSessionCreationDto,
  @CurrentUser() user: { userId: string; role: string }
)
```

**Authorization:**
- Same as single session creation: HOST, ADMIN, or PLAYER roles

**Route:** `POST /sessions/bulk`

## API Specification

### Endpoint
```
POST /sessions/bulk
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

### Request Body

#### Example 1: Single Mode
```json
{
  "mode": "single",
  "baseSession": {
    "name": "Monday Night Badminton",
    "hostName": "John Doe",
    "hostPhone": "0123456789",
    "startTime": "2024-02-05T18:00:00Z",
    "endTime": "2024-02-05T20:00:00Z",
    "numberOfCourts": 2,
    "sessionDuration": 120,
    "maxPlayersPerCourt": 8,
    "requirePlayerInfo": true,
    "allowGuestJoin": true,
    "allowNewPlayers": true,
    "courtColor": "#179a3b",
    "venue": {
      "placeId": "ChIJ...",
      "name": "ABC Sports Center",
      "address": "123 Main St",
      "lat": 10.762622,
      "lng": 106.660172,
      "district": "District 1",
      "city": "Ho Chi Minh City"
    }
  }
}
```

#### Example 2: Specific Dates Mode
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
      "2024-02-19T00:00:00Z",
      "2024-02-26T00:00:00Z"
    ]
  }
}
```

#### Example 3: Recurring Weekdays Mode
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
    "numberOfWeeks": 4,
    "startDate": "2024-02-05T00:00:00Z"
  }
}
```

### Response

#### Success Response
```json
{
  "success": true,
  "sessionsCreated": 4,
  "sessions": [
    {
      "id": "session-1-id",
      "name": "Weekly Game",
      "startTime": "2024-02-05T18:00:00Z",
      "endTime": "2024-02-05T20:00:00Z",
      "host": { ... },
      "venue": { ... },
      "courts": [ ... ],
      "feeConfig": { ... }
    },
    ...
  ],
  "errors": []
}
```

#### Error Response (Transaction Rollback)
```json
{
  "statusCode": 400,
  "message": "Failed to create bulk sessions: [error details]",
  "error": "Bad Request"
}
```

## Transaction Behavior

### All-or-Nothing Semantics
The implementation uses Prisma `$transaction` to ensure:
- If ANY session creation fails, ALL sessions are rolled back
- Database remains in consistent state
- No partial results

### Error Scenarios That Trigger Rollback
1. Invalid venue data (missing required fields)
2. Invalid court configuration
3. Invalid fee configuration
4. Database constraint violations
5. Host not found
6. Invalid level values in requiredLevels

## Testing

### Manual Testing with cURL

#### Test 1: Single Mode
```bash
curl -X POST http://localhost:3000/sessions/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "single",
    "baseSession": {
      "name": "Test Session",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-10T18:00:00Z",
      "endTime": "2024-02-10T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "allowGuestJoin": true,
      "allowNewPlayers": true,
      "venue": {
        "placeId": "test-place-id",
        "name": "Test Venue",
        "address": "123 Test St",
        "city": "Test City"
      }
    }
  }'
```

**Expected:** 1 session created

#### Test 2: Specific Dates Mode
```bash
curl -X POST http://localhost:3000/sessions/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "specific-dates",
    "baseSession": {
      "name": "Weekly Game",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-05T18:00:00Z",
      "endTime": "2024-02-05T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "venue": {
        "placeId": "test-place-id",
        "name": "Test Venue",
        "address": "123 Test St"
      }
    },
    "specificDates": {
      "dates": [
        "2024-02-12T00:00:00Z",
        "2024-02-19T00:00:00Z",
        "2024-02-26T00:00:00Z"
      ]
    }
  }'
```

**Expected:** 4 sessions created (base + 3 clones)
- Session 1: Feb 5, 18:00-20:00
- Session 2: Feb 12, 18:00-20:00
- Session 3: Feb 19, 18:00-20:00
- Session 4: Feb 26, 18:00-20:00

#### Test 3: Recurring Weekdays Mode
```bash
curl -X POST http://localhost:3000/sessions/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "recurring-weekdays",
    "baseSession": {
      "name": "MWF Sessions",
      "hostName": "Test Host",
      "hostPhone": "0123456789",
      "startTime": "2024-02-05T18:00:00Z",
      "endTime": "2024-02-05T20:00:00Z",
      "numberOfCourts": 2,
      "sessionDuration": 120,
      "maxPlayersPerCourt": 8,
      "requirePlayerInfo": true,
      "venue": {
        "placeId": "test-place-id",
        "name": "Test Venue",
        "address": "123 Test St"
      }
    },
    "recurringWeekdays": {
      "weekdays": [1, 3, 5],
      "numberOfWeeks": 2
    }
  }'
```

**Expected:** 6 sessions created (assuming Feb 5 is Monday)
- Week 1: Mon 2/5, Wed 2/7, Fri 2/9
- Week 2: Mon 2/12, Wed 2/14, Fri 2/16

All at 18:00-20:00

#### Test 4: Error Handling (Invalid Mode)
```bash
curl -X POST http://localhost:3000/sessions/bulk \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "invalid-mode",
    "baseSession": { ... }
  }'
```

**Expected:** 400 Bad Request with validation error

#### Test 5: Rollback Test
To test transaction rollback, you can temporarily modify the code to force an error on the 3rd session creation, then verify no sessions were created.

### Testing Checklist

- [ ] Single mode creates 1 session
- [ ] Specific dates mode creates base + cloned sessions
- [ ] Recurring weekdays mode calculates dates correctly
- [ ] Time is preserved when cloning (hours:minutes stay same)
- [ ] Date duplicates are avoided in recurring mode
- [ ] Transaction rollback works (all-or-nothing)
- [ ] Authorization is enforced (JWT required)
- [ ] Validation errors are caught (invalid weekdays, missing dates, etc.)
- [ ] Venue is created/reused correctly
- [ ] Courts are created for each session
- [ ] Fee config is created when provided
- [ ] Multiple users can create bulk sessions simultaneously

## Database Queries

The implementation performs the following database operations per session:
1. Check if host exists (1 query)
2. Check if venue exists / Create venue (1-2 queries)
3. Create session (1 query)
4. Create courts (1 query - `createMany`)
5. Create fee config if provided (0-1 query)
6. Fetch full session with relations (1 query)

**Total:** ~6-8 queries per session

**For bulk creation of 10 sessions:** ~60-80 queries (all within one transaction)

## Performance Considerations

### Current Implementation
- All sessions created sequentially within a transaction
- Good for small batches (1-20 sessions)
- Ensures data consistency

### Future Optimizations (if needed)
If performance becomes an issue with large batches (50+ sessions):
1. **Batch Insert:** Use `createMany` for sessions instead of sequential creates
2. **Background Jobs:** Move large bulk operations to a job queue
3. **Streaming Response:** Return sessions as they're created
4. **Limit:** Add max sessions per request (e.g., 100)

## Security Considerations

### Implemented
- JWT authentication required
- Role-based authorization (HOST, ADMIN, PLAYER)
- Input validation via class-validator decorators
- Transaction prevents partial commits

### Recommended Additional Measures
1. **Rate Limiting:** Limit bulk requests per user (e.g., 10 per hour)
2. **Session Limit:** Max sessions per request (e.g., 100)
3. **Date Validation:** Prevent creating sessions too far in the future
4. **Duplicate Detection:** Check if identical sessions already exist

## Troubleshooting

### Issue: Transaction timeout
**Symptom:** Error after ~30 seconds when creating many sessions
**Solution:** Increase Prisma transaction timeout in `prisma.service.ts`:
```typescript
this.prisma.$transaction(async (tx) => {
  // ...
}, {
  maxWait: 60000, // 60 seconds
  timeout: 120000, // 2 minutes
})
```

### Issue: Duplicate sessions created
**Symptom:** Same session created multiple times on recurring mode
**Solution:** Verify `formatDateOnly()` is working correctly and base date is filtered

### Issue: Validation errors
**Symptom:** DTO validation fails
**Solution:** Check request body matches DTO structure exactly, ensure dates are ISO strings

## Integration with Frontend

The backend is now ready for the frontend implementation at:
- Frontend repo: `/Users/cuongvnnguyen/Documents/badminton-frontend`
- Frontend docs: `BULK_SESSION_IMPLEMENTATION.md`
- API types: `src/lib/api/types.ts`
- Service: `src/lib/api/session.service.ts`

## Deployment Notes

1. Ensure Prisma migrations are run (no schema changes needed)
2. Update API documentation (Swagger) if using
3. Monitor transaction duration in production
4. Set up logging for bulk operations
5. Configure rate limiting if not already present

## Future Enhancements

1. **Partial Success Mode:** Option to continue on errors
2. **Preview Mode:** Calculate dates without creating sessions
3. **Dry Run:** Validate without committing
4. **Template Support:** Save bulk configs as templates
5. **Async Processing:** Queue for large batches with webhook notifications
6. **Bulk Update/Delete:** Similar endpoints for managing existing sessions

## Code Files Changed

1. **NEW:** `src/sessions/dto/bulk-session.dto.ts` - DTOs for bulk creation
2. **UPDATED:** `src/sessions/sessions.service.ts` - Added bulk creation methods
3. **UPDATED:** `src/sessions/sessions.controller.ts` - Added POST /sessions/bulk endpoint

## Contact

For questions or issues:
- Check this documentation
- Review API specification above
- Test with cURL examples
- Check Prisma transaction logs
