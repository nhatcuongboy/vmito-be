# Requirements Document: Tournament Schedule Generator - Assigned Courts & Times Mode

## Introduction

The Tournament Schedule Generator enables tournament organizers to automatically generate complete match schedules by configuring scheduling parameters and constraints. The system intelligently assigns matches to courts and time slots based on category priorities, match durations, court constraints, and time availability. This eliminates manual scheduling work and ensures optimal court utilization while respecting all configured constraints.

## Glossary

- **Schedule_Generator**: The system component responsible for generating match schedules
- **Tournament_Organizer**: The user who manages tournament scheduling
- **Match**: A single game between two participants (teams or individuals)
- **Category**: A tournament division (e.g., "Men's Doubles", "Mixed Doubles")
- **Round**: A stage within a category (e.g., "Pool Play", "Playoffs", "Pool A")
- **Court**: A physical playing area at a venue
- **Time_Slot**: A defined period when courts are available for matches
- **Court_Constraint**: A rule limiting which matches can be assigned to a specific court
- **Category_Priority**: The ordering of categories that determines court sharing precedence
- **Match_Duration**: The configured length of time allocated for a match
- **Time_Buffer**: The configured gap between consecutive matches on the same court
- **Scheduled_Match**: A match with assigned court and time
- **Unscheduled_Match**: A match without assigned court or time
- **Generated_Schedule**: A temporary schedule created by the generator before saving
- **Conflict**: A scheduling violation (double-booked court, player, or time constraint)
- **Schedule_Configuration**: The complete set of parameters used to generate a schedule

## Requirements

### Requirement 1: Schedule Configuration Management

**User Story:** As a Tournament_Organizer, I want to configure scheduling parameters, so that the Schedule_Generator can create schedules matching my tournament needs.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL accept a Schedule_Configuration containing category priorities, match durations, time slots, and court constraints
2. WHEN a Tournament_Organizer adds a Time_Slot, THE Schedule_Generator SHALL store the date, start time, end time, and Time_Buffer
3. WHEN a Tournament_Organizer assigns courts to a Time_Slot, THE Schedule_Generator SHALL associate the selected courts with that Time_Slot
4. WHEN a Tournament_Organizer sets a Court_Constraint, THE Schedule_Generator SHALL store the allowed categories, rounds, and groups for that court
5. WHEN a Tournament_Organizer configures Match_Duration for a round type, THE Schedule_Generator SHALL accept values between 5 minutes and 3 hours in 5-minute increments AND reject invalid durations with a validation error, WHERE Match_Duration values from sources other than organizer configuration MAY fall outside this range
6. THE Schedule_Generator SHALL store separate Match_Duration values for Pool Play and Playoffs round types
7. WHEN a Tournament_Organizer enables "keep scheduled matches", THE Schedule_Generator SHALL preserve existing Scheduled_Matches and only assign Unscheduled_Matches

### Requirement 2: Category Priority Ordering

**User Story:** As a Tournament_Organizer, I want to set category priorities, so that important categories get first choice of court assignments when courts are shared.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL accept an ordered list of categories representing Category_Priority
2. WHEN generating a schedule, THE Schedule_Generator SHALL assign matches from higher-priority categories before lower-priority categories
3. WHEN multiple categories can use the same court, THE Schedule_Generator SHALL prioritize matches according to Category_Priority
4. THE Schedule_Generator SHALL support reordering of Category_Priority at any time before generation

### Requirement 3: Time Slot Management

**User Story:** As a Tournament_Organizer, I want to define when courts are available, so that matches are only scheduled during valid times.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL support multiple Time_Slots with different dates and time ranges
2. WHEN a Tournament_Organizer creates a Time_Slot, THE Schedule_Generator SHALL validate that the end time is after the start time
3. THE Schedule_Generator SHALL support Time_Buffer values between 0 minutes and 3 hours in 5-minute increments
4. WHEN calculating available time, THE Schedule_Generator SHALL subtract Time_Buffer from the gap between consecutive matches
5. THE Schedule_Generator SHALL support editing and deleting Time_Slots before schedule generation
6. WHEN a Time_Slot is deleted, THE Schedule_Generator SHALL remove all associated court assignments for that Time_Slot

### Requirement 4: Court Constraint Configuration

**User Story:** As a Tournament_Organizer, I want to restrict which matches can use specific courts, so that I can manage court allocation based on category importance or facility requirements.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL support Court_Constraints at category, round, and group levels
2. WHEN no Court_Constraint is set for a court, THE Schedule_Generator SHALL allow any match to be assigned to that court
3. WHEN a Court_Constraint specifies allowed categories, THE Schedule_Generator SHALL only assign matches from those categories to that court
4. WHEN a Court_Constraint specifies allowed rounds, THE Schedule_Generator SHALL only assign matches from those rounds to that court
5. WHEN a Court_Constraint specifies allowed groups, THE Schedule_Generator SHALL only assign matches from those groups to that court
6. THE Schedule_Generator SHALL support multiple categories, rounds, and groups in a single Court_Constraint
7. WHEN a court has hierarchical constraints (category and round), THE Schedule_Generator SHALL only assign matches that satisfy all constraint levels AND reject the assignment immediately when any constraint is violated

### Requirement 5: Schedule Generation Algorithm

**User Story:** As a Tournament_Organizer, I want the system to automatically generate an optimal schedule, so that I don't have to manually assign hundreds of matches.

#### Acceptance Criteria

1. WHEN a Tournament_Organizer initiates generation, THE Schedule_Generator SHALL create a Generated_Schedule assigning courts and times to all Unscheduled_Matches
2. THE Schedule_Generator SHALL respect all Court_Constraints when assigning matches
3. THE Schedule_Generator SHALL respect all Time_Slot boundaries when assigning match times
4. THE Schedule_Generator SHALL apply the configured Match_Duration for each match based on its round type
5. THE Schedule_Generator SHALL insert Time_Buffer between consecutive matches on the same court, WHERE a minimal buffer SHALL be inserted even when Time_Buffer is configured to zero
6. THE Schedule_Generator SHALL process categories in Category_Priority order
7. WHEN "keep scheduled matches" is enabled, THE Schedule_Generator SHALL preserve all existing Scheduled_Matches without any regeneration AND only assign completely Unscheduled_Matches
8. WHEN "keep scheduled matches" is disabled, THE Schedule_Generator SHALL regenerate assignments for all matches
9. THE Schedule_Generator SHALL complete generation within 30 seconds for tournaments with up to 500 matches

### Requirement 6: Conflict Detection and Prevention

**User Story:** As a Tournament_Organizer, I want the system to prevent scheduling conflicts, so that no court or player is double-booked.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL detect when a court is assigned to multiple matches at overlapping scheduled times, WHERE overlaps are detected based on actual scheduled time ranges without considering Time_Buffer
2. THE Schedule_Generator SHALL detect when a participant is assigned to multiple matches at overlapping times
3. WHEN a Conflict is detected during generation, THE Schedule_Generator SHALL adjust assignments to resolve the Conflict, WHERE participant conflicts MAY be resolved independently even if court conflicts remain unresolved
4. THE Schedule_Generator SHALL ensure no two matches on the same court have overlapping time ranges including Time_Buffer
5. THE Schedule_Generator SHALL ensure no participant plays in two matches with overlapping time ranges
6. WHEN a Generated_Schedule contains unresolvable Conflicts, THE Schedule_Generator SHALL report which matches could not be scheduled and the reason

### Requirement 7: Schedule Preview and Summary

**User Story:** As a Tournament_Organizer, I want to review the generated schedule before saving, so that I can verify it meets my expectations.

#### Acceptance Criteria

1. WHEN generation completes, THE Schedule_Generator SHALL display a summary showing scheduled match count and total match count per category
2. THE Schedule_Generator SHALL display a breakdown showing scheduled match count per round within each category
3. THE Schedule_Generator SHALL provide a detailed preview showing match number, participants, date, time range, and court assignment for each Scheduled_Match, WHERE an empty preview interface with headers and structure SHALL be displayed when no matches could be scheduled
4. THE Schedule_Generator SHALL organize the preview by category with tabbed navigation
5. THE Schedule_Generator SHALL display matches in chronological order within each category
6. WHEN not all matches could be scheduled, THE Schedule_Generator SHALL clearly indicate which matches remain unscheduled and why, WHERE failure reasons SHALL be displayed even when no matches exist to schedule

### Requirement 8: Individual Match Editing

**User Story:** As a Tournament_Organizer, I want to manually adjust individual match assignments in the preview, so that I can fine-tune the generated schedule.

#### Acceptance Criteria

1. WHEN viewing the Generated_Schedule preview, THE Schedule_Generator SHALL allow editing of individual match assignments
2. WHEN a Tournament_Organizer edits a match, THE Schedule_Generator SHALL allow changing the start time, Match_Duration, and court assignment
3. THE Schedule_Generator SHALL validate that edited match times fall within available Time_Slots
4. THE Schedule_Generator SHALL validate that edited court assignments respect Court_Constraints
5. THE Schedule_Generator SHALL detect and prevent Conflicts when a Tournament_Organizer edits a match
6. WHEN a Conflict is detected during editing, THE Schedule_Generator SHALL display an error message for the Conflict AND prevent the invalid change immediately
7. THE Schedule_Generator SHALL support clearing time and court assignments from a match, returning it to unscheduled state

### Requirement 9: Schedule Persistence

**User Story:** As a Tournament_Organizer, I want to save the generated schedule, so that it becomes the official tournament schedule.

#### Acceptance Criteria

1. WHEN a Tournament_Organizer saves a Generated_Schedule, THE Schedule_Generator SHALL persist all match assignments to the database only when the save operation succeeds completely
2. THE Schedule_Generator SHALL display a confirmation warning before overwriting existing schedules
3. WHEN a Tournament_Organizer confirms the save, THE Schedule_Generator SHALL update all Scheduled_Matches in a single transaction
4. IF the save operation fails, THE Schedule_Generator SHALL roll back all changes and preserve the previous schedule state
5. WHEN the save completes successfully, THE Schedule_Generator SHALL update the schedule progress indicator showing scheduled and unscheduled match counts
6. THE Schedule_Generator SHALL discard the Generated_Schedule after successful save

### Requirement 10: Schedule State Management

**User Story:** As a Tournament_Organizer, I want to track scheduling progress, so that I know how many matches still need scheduling.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL maintain a count of Scheduled_Matches and Unscheduled_Matches for the tournament
2. THE Schedule_Generator SHALL display the scheduled match count and total match count as a progress indicator
3. WHEN matches are added or removed from the tournament, THE Schedule_Generator SHALL update the scheduled and unscheduled counts
4. WHEN a Generated_Schedule is discarded without saving, THE Schedule_Generator SHALL preserve the previous schedule state
5. THE Schedule_Generator SHALL display "0 unscheduled matches" immediately when all matches have court and time assignments

### Requirement 11: Configuration Validation

**User Story:** As a Tournament_Organizer, I want the system to validate my configuration, so that I don't attempt to generate schedules with invalid settings.

#### Acceptance Criteria

1. WHEN a Tournament_Organizer attempts to generate a schedule, THE Schedule_Generator SHALL validate that at least one Time_Slot exists
2. THE Schedule_Generator SHALL validate that at least one court is assigned to at least one Time_Slot
3. THE Schedule_Generator SHALL validate that Match_Duration values are set for all round types present in the tournament, WHERE validation SHALL pass when no round types exist
4. WHEN validation fails, THE Schedule_Generator SHALL display an error message indicating which configuration is missing or invalid
5. THE Schedule_Generator SHALL prevent generation from starting when validation fails
6. THE Schedule_Generator SHALL validate that Time_Slot time ranges do not overlap for the same courts on the same date

### Requirement 12: Court Selection Interface

**User Story:** As a Tournament_Organizer, I want to easily select which courts are available for each time slot, so that I can configure court availability efficiently.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL display all courts from all tournament venues in a selectable list
2. THE Schedule_Generator SHALL show each court's number and venue name in the selection interface
3. THE Schedule_Generator SHALL support selecting multiple courts simultaneously
4. THE Schedule_Generator SHALL support deselecting all courts with a single action
5. WHEN a Tournament_Organizer confirms court selection, THE Schedule_Generator SHALL associate the selected courts with the current Time_Slot
6. THE Schedule_Generator SHALL display the count of selected courts for each Time_Slot

### Requirement 13: Constraint Editing Interface

**User Story:** As a Tournament_Organizer, I want to easily configure court constraints, so that I can control which matches use which courts.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL display a hierarchical constraint editor showing categories, rounds, and groups
2. THE Schedule_Generator SHALL support selecting constraints at category level (applies to all rounds in that category)
3. THE Schedule_Generator SHALL support selecting constraints at round level (applies to specific rounds like "Pool Play" or "Playoffs")
4. THE Schedule_Generator SHALL support selecting constraints at group level (applies to specific groups like "Pool A")
5. WHEN a Tournament_Organizer selects a category-level constraint, THE Schedule_Generator SHALL automatically include all rounds and groups within that category immediately upon selection
6. THE Schedule_Generator SHALL display selected constraints as badges on each court showing the allowed categories and rounds
7. WHEN no constraints exist in the system at all, THE Schedule_Generator SHALL display "Any match" for that court

### Requirement 14: Schedule Cancellation

**User Story:** As a Tournament_Organizer, I want to cancel schedule generation or preview, so that I can return to configuration without saving changes.

#### Acceptance Criteria

1. WHEN viewing the Generated_Schedule preview, THE Schedule_Generator SHALL provide a cancel action
2. WHEN a Tournament_Organizer cancels the preview, THE Schedule_Generator SHALL discard the Generated_Schedule
3. THE Schedule_Generator SHALL preserve the previous schedule state when cancellation occurs
4. THE Schedule_Generator SHALL return the Tournament_Organizer to the configuration interface after cancellation regardless of previous state
5. THE Schedule_Generator SHALL not persist any changes from the Generated_Schedule when cancelled

### Requirement 15: Match Duration Per Round Type

**User Story:** As a Tournament_Organizer, I want to set different match durations for different round types, so that playoff matches can be longer than pool play matches.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL support configuring separate Match_Duration values for "Pool Play" and "Playoffs" round types
2. WHEN generating a schedule, THE Schedule_Generator SHALL apply the Pool Play Match_Duration to all pool play matches AND validate that existing matches have the correct duration, rejecting mismatches
3. WHEN generating a schedule, THE Schedule_Generator SHALL apply the Playoffs Match_Duration to all playoff matches
4. THE Schedule_Generator SHALL default both Pool Play and Playoffs Match_Duration to 60 minutes
5. THE Schedule_Generator SHALL apply the appropriate Match_Duration based on each match's round type

### Requirement 16: Time Slot Expansion and Details

**User Story:** As a Tournament_Organizer, I want to view and edit details for each time slot, so that I can manage time buffers and court assignments per slot.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL display each Time_Slot in a collapsed state showing date and time range
2. WHEN a Tournament_Organizer expands a Time_Slot, THE Schedule_Generator SHALL display the Time_Buffer setting and court list
3. THE Schedule_Generator SHALL allow editing the Time_Buffer for each Time_Slot independently
4. THE Schedule_Generator SHALL display all courts assigned to the Time_Slot with their constraints regardless of assignment status
5. THE Schedule_Generator SHALL provide actions to edit constraints and remove courts from the Time_Slot
6. WHEN a Time_Slot is collapsed, THE Schedule_Generator SHALL hide the detailed settings

### Requirement 17: Schedule Type Switching

**User Story:** As a Tournament_Organizer, I want to switch between schedule modes, so that I can choose between assigned courts/times mode and other scheduling approaches.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL provide a "Switch type" action when a schedule exists
2. WHEN a Tournament_Organizer switches schedule types, THE Schedule_Generator SHALL warn that existing schedules will be affected
3. THE Schedule_Generator SHALL support switching between "Assigned Courts & Times" mode and other schedule modes
4. WHEN switching modes, THE Schedule_Generator SHALL preserve match data while clearing mode-specific assignments

### Requirement 18: Calendar View Integration

**User Story:** As a Tournament_Organizer, I want to view the generated schedule in calendar format, so that I can visualize the timeline of matches.

#### Acceptance Criteria

1. THE Schedule_Generator SHALL provide a calendar view option in the schedule preview
2. WHEN a Tournament_Organizer switches to calendar view, THE Schedule_Generator SHALL display matches organized by date and time
3. THE Schedule_Generator SHALL display court assignments in the calendar view
4. THE Schedule_Generator SHALL support switching between table view and calendar view without losing the Generated_Schedule
5. THE Schedule_Generator SHALL maintain all editing capabilities in calendar view

## Notes

### Algorithm Considerations

The Schedule_Generator algorithm should prioritize:
1. Respecting all hard constraints (court constraints, time slots, no conflicts)
2. Optimizing court utilization (minimizing idle time)
3. Balancing match distribution across available time slots
4. Minimizing participant wait times between matches

### Performance Requirements

- Generation should complete within 30 seconds for typical tournaments (up to 500 matches)
- The system should remain responsive during generation
- Preview rendering should handle displaying 500+ matches efficiently

### Future Enhancements (Out of Scope)

- Automatic optimization suggestions for better court utilization
- Multi-day tournament scheduling with rest day considerations
- Participant preference integration (preferred time slots)
- Automated conflict resolution with multiple resolution strategies
- Export schedule to external calendar formats (iCal, Google Calendar)
