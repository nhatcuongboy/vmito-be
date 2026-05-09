import { Injectable } from '@nestjs/common';

export interface MatchForScheduling {
  id: string;
  categoryId: string;
  round: string;
  matchNumber: number;
  groupId?: string | null;
  startTime?: Date | null;
  courtId?: string | null;
  participantIds: string[]; // categoryRegistrationIds of participants
}

export interface CourtConstraint {
  categories?: string[];
  rounds?: string[];
  groups?: string[];
}

export interface CourtSlotConfig {
  courtId: string;
  constraints?: CourtConstraint | null;
}

export interface TimeSlotConfig {
  date: string; // ISO date "2026-05-10"
  startTime: string; // "09:00"
  endTime: string; // "17:00"
  timeBuffer: number; // minutes
  courts: CourtSlotConfig[];
}

export interface ScheduleGenerationConfig {
  categoryPriorities: string[];
  matchDurations: {
    POOL_PLAY: number;
    PLAYOFFS: number;
  };
  timeSlots: TimeSlotConfig[];
  keepScheduledMatches: boolean;
}

export interface MatchAssignment {
  matchId: string;
  courtId: string;
  startTime: string; // ISO datetime
  duration: number; // minutes
  endTime: string; // ISO datetime
}

export interface ScheduleConflictResult {
  matchId: string;
  reason: string;
  type: 'COURT_OVERLAP' | 'PARTICIPANT_OVERLAP' | 'NO_AVAILABLE_SLOT';
}

export interface GenerationResult {
  assignments: MatchAssignment[];
  conflicts: ScheduleConflictResult[];
}

interface OccupiedSlot {
  courtId: string;
  start: number; // timestamp
  end: number; // timestamp (including buffer)
  endNoBuffer: number; // timestamp without buffer
  matchId: string;
}

@Injectable()
export class ScheduleAlgorithmService {
  generate(
    config: ScheduleGenerationConfig,
    matches: MatchForScheduling[]
  ): GenerationResult {
    const assignments: MatchAssignment[] = [];
    const conflicts: ScheduleConflictResult[] = [];

    // Step 1: Filter matches
    const matchesToSchedule = config.keepScheduledMatches
      ? matches.filter((m) => !m.startTime || !m.courtId)
      : matches;

    // Step 2: Sort by priority
    const sortedMatches = this.sortMatchesByPriority(
      matchesToSchedule,
      config.categoryPriorities
    );

    // Step 3: Build time slot index - represents available windows per court
    const courtOccupancy: OccupiedSlot[] = [];

    // If keepScheduledMatches, pre-populate occupancy with existing scheduled matches
    if (config.keepScheduledMatches) {
      const alreadyScheduled = matches.filter((m) => m.startTime && m.courtId);
      for (const m of alreadyScheduled) {
        const duration = this.getMatchDuration(m, config.matchDurations);
        const startTs = new Date(m.startTime!).getTime();
        const endTs = startTs + duration * 60000;
        courtOccupancy.push({
          courtId: m.courtId!,
          start: startTs,
          end: endTs,
          endNoBuffer: endTs,
          matchId: m.id,
        });
      }
    }

    // Participant schedule tracking
    const participantSchedule = new Map<
      string,
      { start: number; end: number }[]
    >();

    // Pre-populate participant schedules if keeping scheduled matches
    if (config.keepScheduledMatches) {
      const alreadyScheduled = matches.filter((m) => m.startTime && m.courtId);
      for (const m of alreadyScheduled) {
        const duration = this.getMatchDuration(m, config.matchDurations);
        const startTs = new Date(m.startTime!).getTime();
        const endTs = startTs + duration * 60000;
        for (const pid of m.participantIds) {
          if (!participantSchedule.has(pid)) {
            participantSchedule.set(pid, []);
          }
          participantSchedule.get(pid)!.push({ start: startTs, end: endTs });
        }
      }
    }

    // Step 4: Assign each match
    for (const match of sortedMatches) {
      const duration = this.getMatchDuration(match, config.matchDurations);
      const assignment = this.findBestSlot(
        match,
        duration,
        config.timeSlots,
        courtOccupancy,
        participantSchedule
      );

      if (assignment) {
        assignments.push(assignment);

        // Update occupancy
        const buffer = this.getBufferForSlot(assignment, config.timeSlots);
        const startTs = new Date(assignment.startTime).getTime();
        const endTs = startTs + duration * 60000;
        const endWithBuffer = endTs + buffer * 60000;

        courtOccupancy.push({
          courtId: assignment.courtId,
          start: startTs,
          end: endWithBuffer,
          endNoBuffer: endTs,
          matchId: match.id,
        });

        // Track participant schedule
        for (const pid of match.participantIds) {
          if (!participantSchedule.has(pid)) {
            participantSchedule.set(pid, []);
          }
          participantSchedule.get(pid)!.push({ start: startTs, end: endTs });
        }
      } else {
        conflicts.push({
          matchId: match.id,
          reason: 'No available time slot found for this match',
          type: 'NO_AVAILABLE_SLOT',
        });
      }
    }

    return { assignments, conflicts };
  }

  private sortMatchesByPriority(
    matches: MatchForScheduling[],
    categoryPriorities: string[]
  ): MatchForScheduling[] {
    const priorityMap = new Map<string, number>();
    categoryPriorities.forEach((catId, idx) => priorityMap.set(catId, idx));

    return [...matches].sort((a, b) => {
      // Primary: Category priority
      const priA = priorityMap.get(a.categoryId) ?? 999;
      const priB = priorityMap.get(b.categoryId) ?? 999;
      if (priA !== priB) return priA - priB;

      // Secondary: Pool play before playoffs
      const roundOrder = (round: string) => (round === 'GROUP' ? 0 : 1);
      const rA = roundOrder(a.round);
      const rB = roundOrder(b.round);
      if (rA !== rB) return rA - rB;

      // Tertiary: Match number
      return a.matchNumber - b.matchNumber;
    });
  }

  private getMatchDuration(
    match: MatchForScheduling,
    durations: { POOL_PLAY: number; PLAYOFFS: number }
  ): number {
    return match.round === 'GROUP' ? durations.POOL_PLAY : durations.PLAYOFFS;
  }

  private getBufferForSlot(
    assignment: MatchAssignment,
    timeSlots: TimeSlotConfig[]
  ): number {
    // Find which time slot this assignment belongs to
    const assignDate = new Date(assignment.startTime)
      .toISOString()
      .split('T')[0];
    const slot = timeSlots.find((ts) => ts.date === assignDate);
    return slot?.timeBuffer ?? 0;
  }

  private findBestSlot(
    match: MatchForScheduling,
    duration: number,
    timeSlots: TimeSlotConfig[],
    courtOccupancy: OccupiedSlot[],
    participantSchedule: Map<string, { start: number; end: number }[]>
  ): MatchAssignment | null {
    // Build sorted list of candidate windows
    const candidates: {
      courtId: string;
      windowStart: number;
      windowEnd: number;
      buffer: number;
    }[] = [];

    for (const slot of timeSlots) {
      const buffer = slot.timeBuffer;
      const slotDate = new Date(slot.date);

      const [startH, startM] = slot.startTime.split(':').map(Number);
      const [endH, endM] = slot.endTime.split(':').map(Number);

      const slotStart = new Date(slotDate);
      slotStart.setHours(startH, startM, 0, 0);
      const slotEnd = new Date(slotDate);
      slotEnd.setHours(endH, endM, 0, 0);

      for (const courtConfig of slot.courts) {
        // Check constraints
        if (!this.matchSatisfiesConstraints(match, courtConfig.constraints)) {
          continue;
        }

        candidates.push({
          courtId: courtConfig.courtId,
          windowStart: slotStart.getTime(),
          windowEnd: slotEnd.getTime(),
          buffer,
        });
      }
    }

    // Sort candidates by start time
    candidates.sort((a, b) => a.windowStart - b.windowStart);

    // Try each candidate
    for (const candidate of candidates) {
      const result = this.findAvailableWindow(
        match,
        duration,
        candidate.courtId,
        candidate.windowStart,
        candidate.windowEnd,
        candidate.buffer,
        courtOccupancy,
        participantSchedule
      );

      if (result) return result;
    }

    return null;
  }

  private findAvailableWindow(
    match: MatchForScheduling,
    duration: number,
    courtId: string,
    windowStart: number,
    windowEnd: number,
    buffer: number,
    courtOccupancy: OccupiedSlot[],
    participantSchedule: Map<string, { start: number; end: number }[]>
  ): MatchAssignment | null {
    const durationMs = duration * 60000;

    // Get all occupied slots for this court, sorted by start
    const courtSlots = courtOccupancy
      .filter((o) => o.courtId === courtId)
      .sort((a, b) => a.start - b.start);

    // Build free windows
    const freeWindows: { start: number; end: number }[] = [];
    let cursor = windowStart;

    for (const occupied of courtSlots) {
      // Only consider occupied slots that overlap with our window
      if (occupied.end <= windowStart || occupied.start >= windowEnd) continue;

      if (cursor < occupied.start) {
        freeWindows.push({
          start: cursor,
          end: Math.min(occupied.start, windowEnd),
        });
      }
      cursor = Math.max(cursor, occupied.end);
    }

    if (cursor < windowEnd) {
      freeWindows.push({ start: cursor, end: windowEnd });
    }

    // Try each free window
    for (const window of freeWindows) {
      if (window.end - window.start < durationMs) continue;

      const startTime = window.start;
      const endTime = startTime + durationMs;

      // Check participant conflicts
      if (
        this.hasParticipantConflict(
          match.participantIds,
          startTime,
          endTime,
          participantSchedule
        )
      ) {
        // Try shifting within this window
        const shifted = this.tryShiftInWindow(
          match,
          duration,
          window.start,
          window.end,
          courtId,
          participantSchedule
        );
        if (shifted) return shifted;
        continue;
      }

      return {
        matchId: match.id,
        courtId,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        duration,
      };
    }

    return null;
  }

  private tryShiftInWindow(
    match: MatchForScheduling,
    duration: number,
    windowStart: number,
    windowEnd: number,
    courtId: string,
    participantSchedule: Map<string, { start: number; end: number }[]>
  ): MatchAssignment | null {
    const durationMs = duration * 60000;
    const stepMs = 5 * 60000; // Try every 5 minutes

    for (
      let cursor = windowStart;
      cursor + durationMs <= windowEnd;
      cursor += stepMs
    ) {
      if (
        !this.hasParticipantConflict(
          match.participantIds,
          cursor,
          cursor + durationMs,
          participantSchedule
        )
      ) {
        return {
          matchId: match.id,
          courtId,
          startTime: new Date(cursor).toISOString(),
          endTime: new Date(cursor + durationMs).toISOString(),
          duration,
        };
      }
    }

    return null;
  }

  private hasParticipantConflict(
    participantIds: string[],
    startTime: number,
    endTime: number,
    participantSchedule: Map<string, { start: number; end: number }[]>
  ): boolean {
    for (const pid of participantIds) {
      const schedule = participantSchedule.get(pid);
      if (!schedule) continue;

      for (const existing of schedule) {
        if (startTime < existing.end && endTime > existing.start) {
          return true;
        }
      }
    }
    return false;
  }

  private matchSatisfiesConstraints(
    match: MatchForScheduling,
    constraints?: CourtConstraint | null
  ): boolean {
    if (!constraints) return true;

    // Check category constraint
    if (constraints.categories && constraints.categories.length > 0) {
      if (!constraints.categories.includes(match.categoryId)) {
        return false;
      }
    }

    // Check round constraint
    if (constraints.rounds && constraints.rounds.length > 0) {
      if (!constraints.rounds.includes(match.round)) {
        return false;
      }
    }

    // Check group constraint
    if (constraints.groups && constraints.groups.length > 0) {
      if (match.groupId && !constraints.groups.includes(match.groupId)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Detect conflicts in a set of assignments
   */
  detectConflicts(
    assignments: MatchAssignment[],
    matches: Map<string, MatchForScheduling>
  ): ScheduleConflictResult[] {
    const conflicts: ScheduleConflictResult[] = [];

    // Court overlap detection
    const byCourtId = new Map<string, MatchAssignment[]>();
    for (const a of assignments) {
      if (!byCourtId.has(a.courtId)) byCourtId.set(a.courtId, []);
      byCourtId.get(a.courtId)!.push(a);
    }

    for (const [, courtAssignments] of byCourtId) {
      const sorted = courtAssignments.sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const currentEnd = new Date(sorted[i].endTime).getTime();
        const nextStart = new Date(sorted[i + 1].startTime).getTime();
        if (currentEnd > nextStart) {
          conflicts.push({
            matchId: sorted[i + 1].matchId,
            reason: `Court overlap with match ${sorted[i].matchId}`,
            type: 'COURT_OVERLAP',
          });
        }
      }
    }

    // Participant overlap detection
    const allAssignments = assignments.sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    for (let i = 0; i < allAssignments.length; i++) {
      for (let j = i + 1; j < allAssignments.length; j++) {
        const a1 = allAssignments[i];
        const a2 = allAssignments[j];

        const end1 = new Date(a1.endTime).getTime();
        const start2 = new Date(a2.startTime).getTime();

        // No possible overlap with later assignments
        if (end1 <= start2) break;

        const m1 = matches.get(a1.matchId);
        const m2 = matches.get(a2.matchId);

        if (!m1 || !m2) continue;

        // Check shared participants
        const shared = m1.participantIds.filter((pid) =>
          m2.participantIds.includes(pid)
        );
        if (shared.length > 0) {
          conflicts.push({
            matchId: a2.matchId,
            reason: `Participant overlap with match ${a1.matchId}`,
            type: 'PARTICIPANT_OVERLAP',
          });
        }
      }
    }

    return conflicts;
  }
}
