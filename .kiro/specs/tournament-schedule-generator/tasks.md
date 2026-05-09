# Implementation Tasks: Tournament Schedule Generator - Assigned Courts & Times Mode

## Overview

This document breaks down the implementation of the Tournament Schedule Generator into manageable tasks across 4 phases. Each task includes acceptance criteria and dependencies.

---

## Phase 1: Backend Core (Week 1-2)

### Task 1.1: Create Database Migration for Schedule Models ✅ COMPLETED

**Status:** ✅ Done

**Description:** Create Prisma schema and migration for the new schedule-related models.

**Acceptance Criteria:**
- [x] `ScheduleConfiguration` model created
- [x] `ScheduleTimeSlot` model created
- [x] `CourtTimeSlot` model created
- [x] `GeneratedSchedule` model created
- [x] Migration applied successfully
- [x] Prisma client regenerated

**Files:**
- `/prisma/schema.prisma`
- `/prisma/migrations/[timestamp]_add_schedule_models/migration.sql`

---

### Task 1.2: Create DTOs for Schedule Generation

**Status:** 🔲 Not Started

**Description:** Create TypeScript DTOs with validation decorators for all schedule-related API requests.

**Acceptance Criteria:**
- [ ] `GenerateScheduleDto` created with validation
- [ ] `TimeSlotDto` created with validation
- [ ] `CourtTimeSlotDto` created with validation
- [ ] `CourtConstraintDto` created with validation
- [ ] `MatchDurationsDto` created with validation
- [ ] `UpdateMatchAssignmentDto` created with validation
- [ ] All DTOs have proper class-validator decorators
- [ ] Time format validation (HH:mm)
- [ ] Duration range validation (5-180 minutes, step 5)

**Files:**
- `/src/tournaments/dto/schedule-generation.dto.ts`
- `/src/tournaments/dto/update-match-assignment.dto.ts`

**Dependencies:** None

---

### Task 1.3: Implement Configuration Validation Service

**Status:** 🔲 Not Started

**Description:** Create a service to validate schedule configuration before generation.

**Acceptance Criteria:**
- [ ] Validate at least one time slot exists
- [ ] Validate at least one court assigned to time slots
- [ ] Validate match durations set for all round types
- [ ] Validate time slot ranges don't overlap for same courts
- [ ] Validate time ranges (end > start)
- [ ] Return detailed validation errors
- [ ] Unit tests with 80%+ coverage

**Files:**
- `/src/tournaments/services/schedule-validation.service.ts`
- `/src/tournaments/services/schedule-validation.service.spec.ts`

**Dependencies:** Task 1.2

---

### Task 1.4: Implement Schedule Generation Algorithm

**Status:** 🔲 Not Started

**Description:** Implement the core greedy algorithm for assigning matches to courts and time slots.

**Acceptance Criteria:**
- [ ] Sort matches by category priority, round, match number
- [ ] Filter matches based on `keepScheduledMatches` flag
- [ ] Build time slot index for fast lookups
- [ ] Implement `findBestSlot()` function
- [ ] Implement `findAvailableWindow()` function
- [ ] Check court constraints before assignment
- [ ] Insert time buffer between matches
- [ ] Handle minimal buffer when configured to zero
- [ ] Return assignments and conflicts
- [ ] Complete within 30 seconds for 500 matches
- [ ] Unit tests with 80%+ coverage

**Files:**
- `/src/tournaments/services/schedule-algorithm.service.ts`
- `/src/tournaments/services/schedule-algorithm.service.spec.ts`

**Dependencies:** Task 1.3

---

### Task 1.5: Implement Conflict Detection Service

**Status:** 🔲 Not Started

**Description:** Create service to detect court and participant conflicts.

**Acceptance Criteria:**
- [ ] Detect court time overlaps (without buffer)
- [ ] Detect participant time overlaps
- [ ] Check conflicts during generation
- [ ] Check conflicts during manual editing
- [ ] Return detailed conflict information
- [ ] Unit tests with 80%+ coverage

**Files:**
- `/src/tournaments/services/schedule-conflict.service.ts`
- `/src/tournaments/services/schedule-conflict.service.spec.ts`

**Dependencies:** Task 1.4

---

### Task 1.6: Implement Schedule Generator Service

**Status:** 🔲 Not Started

**Description:** Create the main orchestration service that coordinates validation, generation, and persistence.

**Acceptance Criteria:**
- [ ] Orchestrate configuration validation
- [ ] Orchestrate schedule generation
- [ ] Store generated schedule temporarily
- [ ] Retrieve generated schedule for preview
- [ ] Update individual match assignments
- [ ] Persist schedule to database (transaction)
- [ ] Clean up expired generated schedules
- [ ] Handle rollback on save failure
- [ ] Unit tests with 80%+ coverage

**Files:**
- `/src/tournaments/services/schedule-generator.service.ts`
- `/src/tournaments/services/schedule-generator.service.spec.ts`

**Dependencies:** Tasks 1.3, 1.4, 1.5

---

### Task 1.7: Create Schedule API Endpoints

**Status:** 🔲 Not Started

**Description:** Create REST API endpoints for schedule generation and management.

**Acceptance Criteria:**
- [ ] `POST /tournaments/:id/schedule/generate` endpoint
- [ ] `GET /tournaments/:id/schedule/:scheduleId/preview` endpoint
- [ ] `PUT /tournaments/:id/schedule/:scheduleId/matches/:matchId` endpoint
- [ ] `POST /tournaments/:id/schedule/:scheduleId/save` endpoint
- [ ] `POST /tournaments/:id/schedule/validate` endpoint
- [ ] All endpoints have proper authentication
- [ ] All endpoints have proper authorization (tournament ownership)
- [ ] All endpoints return proper error responses
- [ ] Integration tests for all endpoints

**Files:**
- `/src/tournaments/controllers/schedule.controller.ts`
- `/src/tournaments/controllers/schedule.controller.spec.ts`

**Dependencies:** Task 1.6

---

### Task 1.8: Update Tournament Module

**Status:** 🔲 Not Started

**Description:** Register all new services and controllers in the tournament module.

**Acceptance Criteria:**
- [ ] All schedule services registered as providers
- [ ] Schedule controller registered
- [ ] Module compiles without errors
- [ ] All dependencies properly injected

**Files:**
- `/src/tournaments/tournaments.module.ts`

**Dependencies:** Task 1.7

---

## Phase 2: Frontend UI - Configuration (Week 2-3)

### Task 2.1: Create Schedule Generation Context

**Status:** 🔲 Not Started

**Description:** Create React Context for managing schedule generation state.

**Acceptance Criteria:**
- [ ] Context stores configuration state
- [ ] Context stores generated schedule state
- [ ] Context stores UI state (loading, errors)
- [ ] Actions for updating configuration
- [ ] Actions for adding/editing/deleting time slots
- [ ] Actions for reordering categories
- [ ] Actions for generating schedule
- [ ] Actions for updating match assignments
- [ ] Actions for saving schedule
- [ ] Actions for canceling generation
- [ ] TypeScript types for all state

**Files:**
- `/src/contexts/ScheduleGenerationContext.tsx`
- `/src/types/schedule.types.ts`

**Dependencies:** None

---

### Task 2.2: Create Category Priority List Component

**Status:** 🔲 Not Started

**Description:** Build drag-and-drop list for category priority ordering.

**Acceptance Criteria:**
- [ ] Display all tournament categories
- [ ] Support drag-and-drop reordering
- [ ] Visual feedback during drag
- [ ] Update context on reorder
- [ ] Responsive design
- [ ] Accessibility support (keyboard navigation)

**Files:**
- `/src/components/tournament/schedule/CategoryPriorityList.tsx`

**Dependencies:** Task 2.1

---

### Task 2.3: Create Match Duration Configuration Component

**Status:** 🔲 Not Started

**Description:** Build UI for configuring match durations per round type.

**Acceptance Criteria:**
- [ ] Select for Pool Play duration (5-180 min, step 5)
- [ ] Select for Playoffs duration (5-180 min, step 5)
- [ ] Default to 60 minutes
- [ ] Update context on change
- [ ] Validation feedback
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/MatchDurationConfig.tsx`

**Dependencies:** Task 2.1

---

### Task 2.4: Create Time Slot Management Component

**Status:** 🔲 Not Started

**Description:** Build UI for adding, editing, and deleting time slots.

**Acceptance Criteria:**
- [ ] Display list of time slots
- [ ] Add new time slot button
- [ ] Edit time slot (date, start time, end time, buffer)
- [ ] Delete time slot with confirmation
- [ ] Expand/collapse time slot details
- [ ] Display court count per slot
- [ ] Validation (end > start, no overlaps)
- [ ] Update context on changes
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/TimeSlotManagement.tsx`
- `/src/components/tournament/schedule/TimeSlotItem.tsx`
- `/src/components/tournament/schedule/AddTimeSlotModal.tsx`
- `/src/components/tournament/schedule/EditTimeSlotModal.tsx`

**Dependencies:** Task 2.1

---

### Task 2.5: Create Court Selection Modal

**Status:** 🔲 Not Started

**Description:** Build modal for selecting courts for a time slot.

**Acceptance Criteria:**
- [ ] Display all tournament courts
- [ ] Show court number and venue name
- [ ] Support multi-select
- [ ] Select all / deselect all buttons
- [ ] Display selected count
- [ ] Update context on confirm
- [ ] Responsive design
- [ ] Accessibility support

**Files:**
- `/src/components/tournament/schedule/SelectCourtsModal.tsx`

**Dependencies:** Task 2.1

---

### Task 2.6: Create Court Constraint Editor Modal

**Status:** 🔲 Not Started

**Description:** Build modal for editing court constraints.

**Acceptance Criteria:**
- [ ] Display hierarchical constraint tree (categories > rounds > groups)
- [ ] Support category-level selection (auto-includes all rounds/groups)
- [ ] Support round-level selection
- [ ] Support group-level selection
- [ ] Display selected constraints as badges
- [ ] Display "Any match" when no constraints
- [ ] Update context on confirm
- [ ] Responsive design
- [ ] Accessibility support

**Files:**
- `/src/components/tournament/schedule/EditConstraintsModal.tsx`
- `/src/components/tournament/schedule/ConstraintTree.tsx`

**Dependencies:** Task 2.1

---

### Task 2.7: Create Generate Schedule Drawer

**Status:** 🔲 Not Started

**Description:** Build main drawer component that contains all configuration UI.

**Acceptance Criteria:**
- [ ] Keep scheduled matches toggle
- [ ] Category priority list (Task 2.2)
- [ ] Match duration config (Task 2.3)
- [ ] Time slot management (Task 2.4)
- [ ] Generate button
- [ ] Validation before generation
- [ ] Display validation errors
- [ ] Loading state during generation
- [ ] Close drawer on cancel
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/GenerateScheduleDrawer.tsx`

**Dependencies:** Tasks 2.2, 2.3, 2.4, 2.5, 2.6

---

### Task 2.8: Integrate Configuration UI with Backend

**Status:** 🔲 Not Started

**Description:** Connect frontend configuration UI to backend API.

**Acceptance Criteria:**
- [ ] Call validation endpoint before generation
- [ ] Call generation endpoint on submit
- [ ] Handle API errors gracefully
- [ ] Display error messages to user
- [ ] Show loading states
- [ ] Store generated schedule ID
- [ ] Navigate to preview on success

**Files:**
- `/src/api/schedule.api.ts`
- `/src/contexts/ScheduleGenerationContext.tsx` (update)

**Dependencies:** Task 2.7, Phase 1 complete

---

## Phase 3: Frontend UI - Preview & Edit (Week 3-4)

### Task 3.1: Create Schedule Summary Component

**Status:** 🔲 Not Started

**Description:** Build component to display schedule generation summary.

**Acceptance Criteria:**
- [ ] Display total matches vs scheduled matches
- [ ] Display breakdown by category
- [ ] Display breakdown by round within category
- [ ] Display conflict count
- [ ] Visual progress indicators
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/ScheduleSummary.tsx`

**Dependencies:** Task 2.1

---

### Task 3.2: Create Schedule Table View Component

**Status:** 🔲 Not Started

**Description:** Build table view for displaying scheduled matches.

**Acceptance Criteria:**
- [ ] Display match number, participants, date, time, court
- [ ] Group by category with tabs
- [ ] Sort chronologically
- [ ] Highlight conflicts
- [ ] Edit button per match
- [ ] Virtual scrolling for 500+ matches
- [ ] Responsive design
- [ ] Empty state when no matches

**Files:**
- `/src/components/tournament/schedule/ScheduleTableView.tsx`
- `/src/components/tournament/schedule/MatchRow.tsx`

**Dependencies:** Task 2.1

---

### Task 3.3: Create Schedule Calendar View Component

**Status:** 🔲 Not Started

**Description:** Build calendar view for visualizing schedule timeline.

**Acceptance Criteria:**
- [ ] Display matches organized by date and time
- [ ] Show court assignments
- [ ] Support day/week views
- [ ] Click to edit match
- [ ] Highlight conflicts
- [ ] Responsive design
- [ ] Empty state when no matches

**Files:**
- `/src/components/tournament/schedule/ScheduleCalendarView.tsx`

**Dependencies:** Task 2.1

---

### Task 3.4: Create Edit Match Modal

**Status:** 🔲 Not Started

**Description:** Build modal for editing individual match assignments.

**Acceptance Criteria:**
- [ ] Display match details (read-only)
- [ ] Date display (read-only)
- [ ] Start time select
- [ ] Match duration select (5-180 min, step 5)
- [ ] Court select
- [ ] Clear times button
- [ ] Real-time conflict validation
- [ ] Display conflict errors immediately
- [ ] Block save when conflicts exist
- [ ] Update context on save
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/EditMatchModal.tsx`

**Dependencies:** Task 2.1

---

### Task 3.5: Create Conflict Display Component

**Status:** 🔲 Not Started

**Description:** Build component to display schedule conflicts.

**Acceptance Criteria:**
- [ ] Display conflict type (court/participant)
- [ ] Display conflicting match details
- [ ] Display time ranges
- [ ] Visual indicators (icons, colors)
- [ ] Expandable details
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/ConflictDisplay.tsx`

**Dependencies:** Task 2.1

---

### Task 3.6: Create Schedule Preview Drawer

**Status:** 🔲 Not Started

**Description:** Build main drawer for previewing and editing generated schedule.

**Acceptance Criteria:**
- [ ] Schedule summary (Task 3.1)
- [ ] Table/calendar view toggle
- [ ] Table view (Task 3.2)
- [ ] Calendar view (Task 3.3)
- [ ] Conflict display (Task 3.5)
- [ ] Save button
- [ ] Cancel button
- [ ] Loading states
- [ ] Responsive design

**Files:**
- `/src/components/tournament/schedule/SchedulePreviewDrawer.tsx`

**Dependencies:** Tasks 3.1, 3.2, 3.3, 3.4, 3.5

---

### Task 3.7: Create Save Confirmation Modal

**Status:** 🔲 Not Started

**Description:** Build modal to confirm schedule save operation.

**Acceptance Criteria:**
- [ ] Display warning about overwriting existing schedule
- [ ] Display summary of changes
- [ ] Confirm button
- [ ] Cancel button
- [ ] Loading state during save
- [ ] Success feedback
- [ ] Error handling

**Files:**
- `/src/components/tournament/schedule/UpdateScheduleConfirmModal.tsx`

**Dependencies:** Task 2.1

---

### Task 3.8: Integrate Preview UI with Backend

**Status:** 🔲 Not Started

**Description:** Connect frontend preview UI to backend API.

**Acceptance Criteria:**
- [ ] Fetch generated schedule for preview
- [ ] Call update match endpoint on edit
- [ ] Handle edit conflicts from API
- [ ] Call save endpoint on confirm
- [ ] Handle save errors
- [ ] Update tournament schedule state on success
- [ ] Navigate back to schedule panel

**Files:**
- `/src/api/schedule.api.ts` (update)
- `/src/contexts/ScheduleGenerationContext.tsx` (update)

**Dependencies:** Task 3.6, Phase 1 complete

---

## Phase 4: Integration & Testing (Week 4-5)

### Task 4.1: End-to-End Testing

**Status:** 🔲 Not Started

**Description:** Create E2E tests for complete schedule generation flow.

**Acceptance Criteria:**
- [ ] Test complete generation flow (configure → generate → preview → save)
- [ ] Test match editing flow
- [ ] Test conflict detection
- [ ] Test cancellation flow
- [ ] Test validation errors
- [ ] Test with various tournament sizes
- [ ] Test with different constraint configurations
- [ ] All tests passing

**Files:**
- `/e2e/schedule-generation.spec.ts`

**Dependencies:** Phases 1, 2, 3 complete

---

### Task 4.2: Performance Optimization

**Status:** 🔲 Not Started

**Description:** Optimize performance for large tournaments.

**Acceptance Criteria:**
- [ ] Generation completes < 30 seconds for 500 matches
- [ ] API response time < 2 seconds for preview
- [ ] UI interactions < 100ms
- [ ] Memory usage < 500MB
- [ ] Virtual scrolling implemented for large lists
- [ ] Debounced validation
- [ ] Optimistic UI updates
- [ ] Performance benchmarks documented

**Files:**
- `/docs/SCHEDULE-PERFORMANCE.md`

**Dependencies:** Phases 1, 2, 3 complete

---

### Task 4.3: Error Handling Refinement

**Status:** 🔲 Not Started

**Description:** Improve error handling and user feedback.

**Acceptance Criteria:**
- [ ] All API errors have user-friendly messages
- [ ] Validation errors displayed inline
- [ ] Conflict errors highlighted visually
- [ ] Network errors handled gracefully
- [ ] Retry mechanisms for transient failures
- [ ] Error logging for debugging
- [ ] Toast notifications for important events

**Files:**
- Various (update existing files)

**Dependencies:** Phases 1, 2, 3 complete

---

### Task 4.4: Documentation

**Status:** 🔲 Not Started

**Description:** Create comprehensive documentation for the feature.

**Acceptance Criteria:**
- [ ] User guide with screenshots
- [ ] API documentation
- [ ] Architecture documentation
- [ ] Deployment guide
- [ ] Troubleshooting guide
- [ ] Performance benchmarks
- [ ] Known limitations

**Files:**
- `/docs/SCHEDULE-USER-GUIDE.md`
- `/docs/SCHEDULE-API.md`
- `/docs/SCHEDULE-ARCHITECTURE.md`
- `/docs/SCHEDULE-DEPLOYMENT.md`

**Dependencies:** Phases 1, 2, 3 complete

---

### Task 4.5: User Acceptance Testing

**Status:** 🔲 Not Started

**Description:** Conduct UAT with real users and tournament organizers.

**Acceptance Criteria:**
- [ ] UAT plan created
- [ ] Test scenarios documented
- [ ] UAT conducted with 3+ users
- [ ] Feedback collected and documented
- [ ] Critical issues resolved
- [ ] User satisfaction > 80%

**Files:**
- `/docs/SCHEDULE-UAT-REPORT.md`

**Dependencies:** Phases 1, 2, 3 complete

---

## Summary

**Total Tasks:** 33
- **Completed:** 1
- **In Progress:** 0
- **Not Started:** 32

**Estimated Timeline:** 5 weeks

**Next Steps:**
1. Start with Task 1.2 (Create DTOs)
2. Continue with backend tasks in Phase 1
3. Begin frontend work once backend API is stable
4. Conduct testing and optimization in final phase

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-09  
**Status:** Ready for Implementation
