# Technical Design Document: Tournament Schedule Generator - Assigned Courts & Times Mode

## 1. System Overview

### 1.1 High-Level Architecture

The Tournament Schedule Generator consists of three main layers:

**Frontend (Next.js/React)**
- Configuration UI (drawer/modal based)
- Schedule preview and editing
- State management via React Context

**Backend (NestJS)**
- REST API endpoints
- Schedule generation service
- Conflict detection and validation

**Database (PostgreSQL + Prisma)**
- Configuration storage
- Temporary schedule storage
- Match assignment persistence

### 1.2 Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  GenerateScheduleDrawer                                 │ │
│  │  - Category Priority (DnD)                              │ │
│  │  - Match Duration Config                                │ │
│  │  - Time Slot Management                                 │ │
│  │  - Court Constraint Editor                              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  SchedulePreviewDrawer                                  │ │
│  │  - Table/Calendar View                                  │ │
│  │  - Individual Match Editor                              │ │
│  │  - Conflict Display                                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│                    Backend Layer                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ScheduleController                                     │ │
│  │  - POST /generate                                       │ │
│  │  - GET /preview                                         │ │
│  │  - PUT /matches/:id                                     │ │
│  │  - POST /save                                           │ │
│  │  - POST /validate                                       │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ScheduleGeneratorService                               │ │
│  │  - Configuration validation                             │ │
│  │  - Schedule generation orchestration                    │ │
│  │  - Conflict detection                                   │ │
│  │  - Persistence management                               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  ScheduleAlgorithm                                      │ │
│  │  - Greedy assignment with constraints                   │ │
│  │  - Time slot allocation                                 │ │
│  │  - Court assignment                                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓ Prisma ORM
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                            │
│  - ScheduleConfiguration                                     │
│  - ScheduleTimeSlot                                          │
│  - CourtTimeSlot                                             │
│  - GeneratedSchedule (temporary)                             │
│  - CategoryMatch (updated)                                   │
│  - TournamentCourt (updated)                                 │
└─────────────────────────────────────────────────────────────┘
```

## 2. Database Design

### 2.1 New Models

#### ScheduleConfiguration
Stores the scheduling configuration for a tournament.

```prisma
model ScheduleConfiguration {
  id                    String   @id @default(cuid())
  tournamentId          String   @unique
  categoryPriorities    Json     // Ordered array of category IDs
  matchDurations        Json     // { "POOL_PLAY": 60, "PLAYOFFS": 60 }
  keepScheduledMatches  Boolean  @default(false)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  tournament Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
  timeSlots  ScheduleTimeSlot[]
  
  @@map("schedule_configurations")
}
```

#### ScheduleTimeSlot
Defines when courts are available for matches.

```prisma
model ScheduleTimeSlot {
  id              String   @id @default(cuid())
  configId        String
  date            DateTime
  startTime       String   // "09:00"
  endTime         String   // "17:00"
  timeBuffer      Int      @default(0) // minutes
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  configuration ScheduleConfiguration @relation(fields: [configId], references: [id], onDelete: Cascade)
  courtSlots    CourtTimeSlot[]
  
  @@map("schedule_time_slots")
}
```

#### CourtTimeSlot
Links courts to time slots with optional constraints.

```prisma
model CourtTimeSlot {
  id           String   @id @default(cuid())
  timeSlotId   String
  courtId      String
  constraints  Json?    // { categories: [], rounds: [], groups: [] }
  createdAt    DateTime @default(now())
  
  timeSlot ScheduleTimeSlot @relation(fields: [timeSlotId], references: [id], onDelete: Cascade)
  court    TournamentCourt  @relation(fields: [courtId], references: [id], onDelete: Cascade)
  
  @@unique([timeSlotId, courtId])
  @@map("court_time_slots")
}
```

#### GeneratedSchedule
Temporary storage for generated schedules before saving.

```prisma
model GeneratedSchedule {
  id             String   @id @default(cuid())
  tournamentId   String
  configSnapshot Json     // Full configuration used
  assignments    Json     // Array of {matchId, courtId, startTime, duration}
  conflicts      Json     // Array of unresolved conflicts
  createdAt      DateTime @default(now())
  expiresAt      DateTime // Auto-delete after 1 hour
  
  @@index([tournamentId])
  @@index([expiresAt])
  @@map("generated_schedules")
}
```

### 2.2 Model Relationships

```
Tournament (1) ──── (1) ScheduleConfiguration
                          │
                          ├──── (*) ScheduleTimeSlot
                          │           │
                          │           └──── (*) CourtTimeSlot ──── (*) TournamentCourt
                          │
                          └──── (*) GeneratedSchedule (temporary)

CategoryMatch
  - courtId (FK to TournamentCourt)
  - startTime, scheduledDuration, estimatedEndTime (from previous migration)
```

### 2.3 Indexes

```sql
-- Performance indexes
CREATE INDEX idx_generated_schedule_tournament ON generated_schedules(tournamentId);
CREATE INDEX idx_generated_schedule_expires ON generated_schedules(expiresAt);
CREATE INDEX idx_court_time_slot_lookup ON court_time_slots(timeSlotId, courtId);
CREATE INDEX idx_category_match_scheduling ON category_matches(categoryId, round, startTime);
```

## 3. API Design

### 3.1 Endpoints

#### POST `/tournaments/:tournamentId/schedule/generate`

Generates a schedule based on provided configuration.

**Request Body:**
```typescript
{
  categoryPriorities: string[];  // Ordered category IDs
  matchDurations: {
    POOL_PLAY: number;   // minutes (5-180, step 5)
    PLAYOFFS: number;    // minutes (5-180, step 5)
  };
  timeSlots: {
    date: string;        // ISO date "2026-05-10"
    startTime: string;   // "09:00"
    endTime: string;     // "17:00"
    timeBuffer: number;  // minutes (0-180, step 5)
    courts: {
      courtId: string;
      constraints?: {
        categories?: string[];
        rounds?: string[];
        groups?: string[];
      };
    }[];
  }[];
  keepScheduledMatches: boolean;
}
```

**Response:**
```typescript
{
  scheduleId: string;
  summary: {
    totalMatches: number;
    scheduledMatches: number;
    unscheduledMatches: number;
    byCategory: {
      categoryId: string;
      categoryName: string;
      scheduled: number;
      total: number;
      byRound: {
        round: string;
        scheduled: number;
        total: number;
      }[];
    }[];
  };
  conflicts: {
    matchId: string;
    reason: string;
    type: 'COURT_OVERLAP' | 'PARTICIPANT_OVERLAP' | 'NO_AVAILABLE_SLOT';
  }[];
}
```

#### GET `/tournaments/:tournamentId/schedule/:scheduleId/preview`

Retrieves the generated schedule for preview.

**Response:**
```typescript
{
  scheduleId: string;
  matches: {
    matchId: string;
    matchNumber: number;
    categoryId: string;
    categoryName: string;
    round: string;
    participants: string[];
    courtId: string;
    courtName: string;
    startTime: string;  // ISO datetime
    endTime: string;    // ISO datetime
    duration: number;   // minutes
  }[];
}
```

#### PUT `/tournaments/:tournamentId/schedule/:scheduleId/matches/:matchId`

Updates a single match assignment in the generated schedule.

**Request Body:**
```typescript
{
  courtId: string;
  startTime: string;  // ISO datetime
  duration: number;   // minutes
}
```

**Response:**
```typescript
{
  success: boolean;
  conflicts?: {
    type: 'COURT_OVERLAP' | 'PARTICIPANT_OVERLAP' | 'CONSTRAINT_VIOLATION';
    message: string;
  }[];
}
```

#### POST `/tournaments/:tournamentId/schedule/:scheduleId/save`

Persists the generated schedule to the database.

**Response:**
```typescript
{
  success: boolean;
  scheduledCount: number;
  unscheduledCount: number;
}
```

#### POST `/tournaments/:tournamentId/schedule/validate`

Validates configuration before generation.

**Request Body:** Same as generate endpoint

**Response:**
```typescript
{
  valid: boolean;
  errors: {
    field: string;
    message: string;
  }[];
}
```

### 3.2 DTOs

```typescript
// src/tournaments/dto/schedule-generation.dto.ts

export class CourtConstraintDto {
  @IsArray()
  @IsOptional()
  categories?: string[];
  
  @IsArray()
  @IsOptional()
  rounds?: string[];
  
  @IsArray()
  @IsOptional()
  groups?: string[];
}

export class CourtTimeSlotDto {
  @IsString()
  courtId: string;
  
  @ValidateNested()
  @IsOptional()
  constraints?: CourtConstraintDto;
}

export class TimeSlotDto {
  @IsISO8601()
  date: string;
  
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;
  
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime: string;
  
  @IsInt()
  @Min(0)
  @Max(180)
  timeBuffer: number;
  
  @IsArray()
  @ValidateNested({ each: true })
  courts: CourtTimeSlotDto[];
}

export class MatchDurationsDto {
  @IsInt()
  @Min(5)
  @Max(180)
  POOL_PLAY: number;
  
  @IsInt()
  @Min(5)
  @Max(180)
  PLAYOFFS: number;
}

export class GenerateScheduleDto {
  @IsArray()
  @IsString({ each: true })
  categoryPriorities: string[];
  
  @ValidateNested()
  @Type(() => MatchDurationsDto)
  matchDurations: MatchDurationsDto;
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeSlotDto)
  timeSlots: TimeSlotDto[];
  
  @IsBoolean()
  keepScheduledMatches: boolean;
}

export class UpdateMatchAssignmentDto {
  @IsString()
  courtId: string;
  
  @IsISO8601()
  startTime: string;
  
  @IsInt()
  @Min(5)
  @Max(180)
  duration: number;
}
```

## 4. Algorithm Design

### 4.1 Schedule Generation Algorithm

**Approach:** Greedy Assignment with Constraint Satisfaction

**Time Complexity:** O(n × m × k) where:
- n = number of matches
- m = number of time slots
- k = number of courts per slot

**Space Complexity:** O(n + m × k)

**Algorithm Steps:**

1. **Initialize**
   - Create empty schedule map
   - Initialize conflicts array
   - Build time slot index for fast lookups

2. **Filter Matches**
   - If `keepScheduledMatches`: filter out already scheduled matches
   - Otherwise: include all matches

3. **Sort Matches**
   - Primary: Category priority order
   - Secondary: Round (Pool Play before Playoffs)
   - Tertiary: Match number

4. **Assign Matches**
   - For each match in sorted order:
     - Get eligible courts (check constraints)
     - For each time slot (chronological):
       - For each eligible court:
         - Find available time window
         - Check participant conflicts
         - If valid: assign and continue
     - If no valid slot found: add to conflicts

5. **Return Result**
   - Generated schedule with assignments
   - List of unresolved conflicts

**Pseudocode:**

```typescript
function generateSchedule(config: ScheduleConfig, matches: Match[]): GeneratedSchedule {
  const schedule = new Map<string, MatchAssignment>();
  const conflicts: Conflict[] = [];
  
  // Step 1: Filter matches
  const matchesToSchedule = config.keepScheduledMatches
    ? matches.filter(m => !m.startTime || !m.courtId)
    : matches;
  
  // Step 2: Sort by priority
  const sortedMatches = sortMatchesByPriority(
    matchesToSchedule,
    config.categoryPriorities
  );
  
  // Step 3: Build time slot index
  const timeSlotIndex = buildTimeSlotIndex(config.timeSlots);
  
  // Step 4: Assign each match
  for (const match of sortedMatches) {
    const assignment = findBestSlot(
      match,
      timeSlotIndex,
      schedule,
      config
    );
    
    if (assignment) {
      schedule.set(match.id, assignment);
      updateTimeSlotIndex(timeSlotIndex, assignment);
    } else {
      conflicts.push({
        matchId: match.id,
        reason: 'No available slot found',
        type: 'NO_AVAILABLE_SLOT'
      });
    }
  }
  
  return { schedule, conflicts };
}

function findBestSlot(
  match: Match,
  timeSlotIndex: TimeSlotIndex,
  existingSchedule: Map<string, MatchAssignment>,
  config: ScheduleConfig
): MatchAssignment | null {
  const duration = getMatchDuration(match, config);
  const eligibleCourts = getEligibleCourts(match, config);
  
  // Try each time slot chronologically
  for (const slot of timeSlotIndex.slots) {
    for (const court of eligibleCourts) {
      if (!slot.courts.includes(court.id)) continue;
      
      // Find available time window
      const window = findAvailableWindow(
        court.id,
        slot,
        duration,
        config.timeBuffer,
        existingSchedule
      );
      
      if (window) {
        // Check participant conflicts
        if (!hasParticipantConflict(match, window, existingSchedule)) {
          return {
            matchId: match.id,
            courtId: court.id,
            startTime: window.start,
            endTime: window.end,
            duration
          };
        }
      }
    }
  }
  
  return null;
}
```

### 4.2 Conflict Detection

**Court Overlap Detection:**

```typescript
function detectCourtConflicts(
  schedule: Map<string, MatchAssignment>
): Conflict[] {
  const conflicts: Conflict[] = [];
  const courtAssignments = groupByCourtId(schedule);
  
  for (const [courtId, assignments] of courtAssignments) {
    const sorted = sortByStartTime(assignments);
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      
      // Check if current match ends after next match starts
      if (current.endTime > next.startTime) {
        conflicts.push({
          type: 'COURT_OVERLAP',
          matchId: next.matchId,
          conflictingMatchId: current.matchId,
          courtId,
          message: `Court ${courtId} double-booked`
        });
      }
    }
  }
  
  return conflicts;
}
```

**Participant Overlap Detection:**

```typescript
function detectParticipantConflicts(
  schedule: Map<string, MatchAssignment>,
  matches: Map<string, Match>
): Conflict[] {
  const conflicts: Conflict[] = [];
  const assignments = Array.from(schedule.values())
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  
  for (let i = 0; i < assignments.length; i++) {
    for (let j = i + 1; j < assignments.length; j++) {
      const a1 = assignments[i];
      const a2 = assignments[j];
      
      // Check time overlap
      if (timeWindowsOverlap(
        { start: a1.startTime, end: a1.endTime },
        { start: a2.startTime, end: a2.endTime }
      )) {
        const m1 = matches.get(a1.matchId)!;
        const m2 = matches.get(a2.matchId)!;
        
        const p1 = getParticipants(m1);
        const p2 = getParticipants(m2);
        
        const common = p1.filter(p => p2.includes(p));
        
        if (common.length > 0) {
          conflicts.push({
            type: 'PARTICIPANT_OVERLAP',
            matchId: a2.matchId,
            conflictingMatchId: a1.matchId,
            participantIds: common,
            message: `Participant(s) ${common.join(', ')} double-booked`
          });
        }
      }
    }
  }
  
  return conflicts;
}
```

### 4.3 Constraint Validation

```typescript
function validateCourtConstraints(
  match: Match,
  court: Court,
  constraints: CourtConstraint | null
): boolean {
  if (!constraints) return true;
  
  // Check category constraint
  if (constraints.categories?.length > 0) {
    if (!constraints.categories.includes(match.categoryId)) {
      return false;
    }
  }
  
  // Check round constraint
  if (constraints.rounds?.length > 0) {
    if (!constraints.rounds.includes(match.round)) {
      return false;
    }
  }
  
  // Check group constraint
  if (constraints.groups?.length > 0) {
    if (match.groupId && !constraints.groups.includes(match.groupId)) {
      return false;
    }
  }
  
  return true;
}

function validateTimeSlotBoundaries(
  startTime: Date,
  duration: number,
  timeSlot: TimeSlot
): boolean {
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
  
  return startTime >= timeSlot.startTime && endTime <= timeSlot.endTime;
}
```

## 5. Frontend Architecture

### 5.1 Component Hierarchy

```
TournamentManage
└── OrganizeTab
    └── SchedulePanel
        ├── ScheduleStatusCard
        │   ├── Progress (23/23)
        │   ├── ManageScheduleButton
        │   └── SwitchTypeButton
        │
        └── ManageScheduleModal
            ├── GenerateScheduleDrawer
            │   ├── KeepScheduledToggle
            │   ├── CategoryPriorityList (DnD)
            │   ├── MatchLengthConfig
            │   ├── AvailableTimesSection
            │   └── GenerateButton
            │
            ├── EditConstraintsModal
            ├── SelectCourtsModal
            ├── GeneratedScheduleModal
            ├── SchedulePreviewDrawer
            ├── EditMatchModal
            └── UpdateScheduleConfirmModal
```

### 5.2 State Management

**React Context Pattern:**

```typescript
interface ScheduleGenerationContext {
  // Configuration state
  config: {
    categoryPriorities: string[];
    matchDurations: {
      POOL_PLAY: number;
      PLAYOFFS: number;
    };
    timeSlots: TimeSlot[];
    keepScheduledMatches: boolean;
  };
  
  // Generated schedule state
  generatedSchedule: {
    scheduleId: string | null;
    summary: ScheduleSummary | null;
    matches: ScheduledMatch[];
    conflicts: Conflict[];
  };
  
  // UI state
  ui: {
    currentStep: 'configure' | 'preview' | 'confirm';
    isGenerating: boolean;
    isSaving: boolean;
    errors: string[];
  };
  
  // Actions
  updateConfig: (config: Partial<ScheduleConfig>) => void;
  addTimeSlot: (slot: TimeSlot) => void;
  removeTimeSlot: (slotId: string) => void;
  updateTimeSlot: (slotId: string, updates: Partial<TimeSlot>) => void;
  reorderCategories: (newOrder: string[]) => void;
  generateSchedule: () => Promise<void>;
  updateMatchAssignment: (matchId: string, assignment: MatchAssignment) => Promise<void>;
  saveSchedule: () => Promise<void>;
  cancelGeneration: () => void;
}
```

### 5.3 Key Components

**GenerateScheduleDrawer:**
- Category priority list with drag-and-drop
- Match duration selects (5 min - 3 hours, 5-min steps)
- Time slot management (add/edit/delete)
- Court selection and constraint configuration
- Real-time validation

**SchedulePreviewDrawer:**
- Table view and calendar view toggle
- Category tabs for filtering
- Match list with edit capability
- Conflict highlighting
- Save confirmation

**EditMatchModal:**
- Date display (read-only)
- Start time select
- Match length select
- Court select
- Clear times button
- Real-time conflict validation

## 6. Implementation Plan

### Phase 1: Backend Core (Week 1-2)

**Tasks:**
1. Create database migration for new models
2. Implement ScheduleGeneratorService
3. Implement schedule generation algorithm
4. Implement conflict detection
5. Create API endpoints
6. Write unit tests

**Deliverables:**
- Working API endpoints
- 80%+ test coverage
- API documentation

### Phase 2: Frontend UI (Week 2-3)

**Tasks:**
1. Create ScheduleGenerationContext
2. Build GenerateScheduleDrawer
3. Implement category priority DnD
4. Build time slot management UI
5. Build court constraint editor
6. Implement validation

**Deliverables:**
- Complete configuration UI
- Form validation
- Error handling

### Phase 3: Preview & Edit (Week 3-4)

**Tasks:**
1. Build SchedulePreviewDrawer
2. Implement table view
3. Implement calendar view
4. Build EditMatchModal
5. Implement conflict display
6. Build save confirmation

**Deliverables:**
- Complete preview UI
- Match editing capability
- Save functionality

### Phase 4: Integration & Testing (Week 4-5)

**Tasks:**
1. E2E testing
2. Performance optimization
3. Error handling refinement
4. Documentation
5. User acceptance testing

**Deliverables:**
- Tested feature
- Performance benchmarks
- User documentation

## 7. Performance Considerations

### 7.1 Backend Optimization

- **Time Slot Indexing**: Pre-build court availability map
- **Early Termination**: Stop searching after first valid slot
- **Batch Operations**: Use transactions for bulk updates
- **Caching**: Cache tournament data during generation

### 7.2 Frontend Optimization

- **Virtual Scrolling**: For 500+ matches in table view
- **Debounced Validation**: Delay validation during typing
- **Optimistic Updates**: Update UI before server confirmation
- **Lazy Loading**: Load match details on demand

### 7.3 Performance Targets

- Schedule generation: < 30 seconds for 500 matches
- API response time: < 2 seconds for preview
- UI responsiveness: < 100ms for interactions
- Memory usage: < 500MB for large tournaments

## 8. Security & Validation

### 8.1 Backend Security

- Tournament ownership verification
- Input validation via DTOs
- SQL injection prevention (Prisma ORM)
- Rate limiting on generation endpoint

### 8.2 Frontend Validation

- Required field validation
- Time range validation
- Duration range validation (5-180 minutes)
- Real-time conflict checking

## 9. Error Handling

### 9.1 Backend Errors

```typescript
// Configuration validation errors
{
  statusCode: 400,
  message: 'Validation failed',
  errors: [
    { field: 'timeSlots', message: 'At least one time slot required' }
  ]
}

// Generation errors
{
  statusCode: 500,
  message: 'Schedule generation failed',
  error: 'Algorithm timeout'
}

// Conflict errors
{
  statusCode: 409,
  message: 'Schedule conflicts detected',
  conflicts: [...]
}
```

### 9.2 Frontend Error Display

- Toast notifications for API errors
- Inline validation errors
- Conflict highlighting in preview
- Confirmation dialogs for destructive actions

## 10. Testing Strategy

### 10.1 Unit Tests

- Algorithm correctness
- Conflict detection accuracy
- Constraint validation
- DTO validation

### 10.2 Integration Tests

- API endpoint functionality
- Database transactions
- Error handling
- Edge cases

### 10.3 E2E Tests

- Complete generation flow
- Match editing flow
- Save and rollback
- Conflict scenarios

## 11. Future Enhancements

- AI-powered schedule optimization
- Multi-day tournament support
- Player rest time considerations
- Automated conflict resolution
- Schedule export (PDF, iCal)
- Real-time collaboration
- Schedule templates

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-09  
**Status:** Ready for Implementation
