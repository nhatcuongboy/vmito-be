/**
 * Scoring Engine for Session Recommendations
 *
 * This utility class implements the scoring algorithm for session recommendations.
 * It calculates relevance scores based on multiple weighted factors:
 * - Location proximity (30%)
 * - Level matching (25%)
 * - Time proximity (20%)
 * - Same host (15%)
 * - Available slots (10%)
 */

interface SessionForScoring {
  id: string;
  venueId?: string | null;
  hostId: string;
  startTime?: Date | null;
  endTime?: Date | null;
  requiredLevels: number[];
  numberOfCourts: number;
  maxPlayersPerCourt: number;
  venue?: {
    id: string;
    lat?: number | null;
    lng?: number | null;
  } | null;
}

interface ScoreComponents {
  location: number;
  level: number;
  time: number;
  host: number;
  slots: number;
}

interface ScoreResult {
  total: number;
  components: ScoreComponents;
}

export class ScoringEngine {
  // Scoring weights (must sum to 1.0)
  private static readonly WEIGHTS = {
    location: 0.3,
    level: 0.25,
    time: 0.2,
    host: 0.15,
    slots: 0.1,
  };

  // Distance thresholds in kilometers
  private static readonly DISTANCE_THRESHOLDS = {
    sameVenue: 0,
    within1km: 1,
    within3km: 3,
  };

  // Time thresholds in hours
  private static readonly TIME_THRESHOLDS = {
    within2hours: 2,
    within4hours: 4,
    sameDay: 24,
  };

  /**
   * Calculate relevance score between current and candidate session
   * @param current - Current session being viewed
   * @param candidate - Candidate session to score
   * @param distance - Pre-calculated distance in km (optional)
   * @param approvedPlayerCount - Number of approved players in candidate session
   * @returns Score object with total and component scores
   */
  static calculateRelevanceScore(
    current: SessionForScoring,
    candidate: SessionForScoring,
    distance?: number | null,
    approvedPlayerCount?: number
  ): ScoreResult {
    const components: ScoreComponents = {
      location: this.scoreLocation(current, candidate, distance),
      level: this.scoreLevel(current, candidate),
      time: this.scoreTime(current, candidate),
      host: this.scoreHost(current, candidate),
      slots: this.scoreSlots(candidate, approvedPlayerCount),
    };

    const total =
      this.WEIGHTS.location * components.location +
      this.WEIGHTS.level * components.level +
      this.WEIGHTS.time * components.time +
      this.WEIGHTS.host * components.host +
      this.WEIGHTS.slots * components.slots;

    return {
      total: Math.max(0, Math.min(1, total)), // Clamp to [0, 1]
      components,
    };
  }

  /**
   * Score location proximity
   * - Same venue: 1.0
   * - Within 1km: 0.8
   * - Within 3km: 0.5
   * - Beyond 3km: 0.0
   * - Missing coordinates: 0.5 (default)
   *
   * @param current - Current session
   * @param candidate - Candidate session
   * @param distance - Pre-calculated distance in km (optional)
   * @returns Location score (0-1)
   */
  static scoreLocation(
    current: SessionForScoring,
    candidate: SessionForScoring,
    distance?: number | null
  ): number {
    // Same venue
    if (
      current.venueId &&
      candidate.venueId &&
      current.venueId === candidate.venueId
    ) {
      return 1.0;
    }

    // If distance is provided, use it
    if (distance !== undefined && distance !== null) {
      if (distance <= this.DISTANCE_THRESHOLDS.within1km) {
        return 0.8;
      }
      if (distance <= this.DISTANCE_THRESHOLDS.within3km) {
        return 0.5;
      }
      return 0.0;
    }

    // Missing coordinates: default score
    return 0.5;
  }

  /**
   * Score level matching
   * - Exact match: 1.0
   * - ±1 level: 0.7
   * - ±2 levels: 0.4
   * - Beyond ±2: 0.0
   * - Empty required levels (accepts all): 1.0
   *
   * @param current - Current session
   * @param candidate - Candidate session
   * @returns Level score (0-1)
   */
  static scoreLevel(
    current: SessionForScoring,
    candidate: SessionForScoring
  ): number {
    // If candidate has no level requirements, it accepts all levels
    if (!candidate.requiredLevels || candidate.requiredLevels.length === 0) {
      return 1.0;
    }

    // If current session has no level requirements, use moderate score
    if (!current.requiredLevels || current.requiredLevels.length === 0) {
      return 0.7;
    }

    // Find minimum level difference between current and candidate
    let minDiff = Infinity;
    for (const currentLevel of current.requiredLevels) {
      for (const candidateLevel of candidate.requiredLevels) {
        const diff = Math.abs(currentLevel - candidateLevel);
        minDiff = Math.min(minDiff, diff);
      }
    }

    // Score based on minimum difference
    if (minDiff === 0) return 1.0; // Exact match
    if (minDiff === 1) return 0.7; // ±1 level
    if (minDiff === 2) return 0.4; // ±2 levels
    return 0.0; // Beyond ±2
  }

  /**
   * Score time proximity
   * - Within 2 hours: 1.0
   * - Within 4 hours: 0.6
   * - Same day: 0.3
   * - Different day: 0.0
   * - Missing start time: 0.5 (default)
   *
   * @param current - Current session
   * @param candidate - Candidate session
   * @returns Time score (0-1)
   */
  static scoreTime(
    current: SessionForScoring,
    candidate: SessionForScoring
  ): number {
    if (!current.startTime || !candidate.startTime) {
      return 0.5; // Default score if time missing
    }

    const currentTime = new Date(current.startTime).getTime();
    const candidateTime = new Date(candidate.startTime).getTime();
    const diffMs = Math.abs(currentTime - candidateTime);
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours <= this.TIME_THRESHOLDS.within2hours) {
      return 1.0;
    }
    if (diffHours <= this.TIME_THRESHOLDS.within4hours) {
      return 0.6;
    }
    if (diffHours <= this.TIME_THRESHOLDS.sameDay) {
      return 0.3;
    }
    return 0.0;
  }

  /**
   * Score host matching
   * - Same host: 1.0
   * - Different host: 0.0
   *
   * @param current - Current session
   * @param candidate - Candidate session
   * @returns Host score (0 or 1)
   */
  static scoreHost(
    current: SessionForScoring,
    candidate: SessionForScoring
  ): number {
    return current.hostId === candidate.hostId ? 1.0 : 0.0;
  }

  /**
   * Score available slots
   * - 4+ slots: 1.0
   * - 2-3 slots: 0.6
   * - 1 slot: 0.3
   * - 0 slots: 0.0
   *
   * @param candidate - Candidate session
   * @param approvedPlayerCount - Number of approved players (optional)
   * @returns Slots score (0-1)
   */
  static scoreSlots(
    candidate: SessionForScoring,
    approvedPlayerCount?: number
  ): number {
    const maxSlots = candidate.numberOfCourts * candidate.maxPlayersPerCourt;
    const usedSlots = approvedPlayerCount ?? 0;
    const availableSlots = Math.max(0, maxSlots - usedSlots);

    if (availableSlots >= 4) return 1.0;
    if (availableSlots >= 2) return 0.6;
    if (availableSlots >= 1) return 0.3;
    return 0.0;
  }

  /**
   * Generate match reasons based on score components
   * @param current - Current session
   * @param candidate - Candidate session
   * @param score - Score result
   * @param distance - Pre-calculated distance in km (optional)
   * @returns Array of match reason strings
   */
  static getMatchReasons(
    current: SessionForScoring,
    candidate: SessionForScoring,
    score: ScoreResult,
    _distance?: number | null
  ): string[] {
    const reasons: string[] = [];

    // Location reasons
    if (score.components.location >= 0.5) {
      if (current.venueId === candidate.venueId) {
        reasons.push('same_venue');
      } else {
        reasons.push('nearby');
      }
    }

    // Level reasons
    if (score.components.level >= 0.7) {
      reasons.push('similar_level');
    }

    // Time reasons
    if (score.components.time >= 0.6) {
      reasons.push('nearby_time');
    }

    // Host reasons
    if (score.components.host === 1.0) {
      reasons.push('same_host');
    }

    // Slots reasons
    if (score.components.slots > 0) {
      reasons.push('available_slots');
    }

    return reasons;
  }

  /**
   * Haversine formula to calculate distance between two lat/lng points in kilometers
   * (Reused from existing SessionsService implementation)
   *
   * @param lat1 - Latitude of first point
   * @param lng1 - Longitude of first point
   * @param lat2 - Latitude of second point
   * @param lng2 - Longitude of second point
   * @returns Distance in kilometers, rounded to 1 decimal place
   */
  static calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return Math.round(distance * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Convert degrees to radians
   * @param degrees - Angle in degrees
   * @returns Angle in radians
   */
  private static toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
