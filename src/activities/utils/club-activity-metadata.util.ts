import { ClubJoinPolicy } from '@prisma/client';
import { ClubMetadata } from '../activity-metadata.types';
import { toDescriptionExcerpt } from './description-excerpt.util';

/** The club fields every activity post needs to link back and to be gated. */
export interface ClubActivitySource {
  id: string;
  slug?: string | null;
  name: string;
  logo?: string | null;
  isPublic: boolean;
}

export interface ClubActivityDetails extends ClubActivitySource {
  description?: string | null;
  joinPolicy: ClubJoinPolicy;
  requiredLevels: number[];
  schedules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
  defaultVenue?: {
    name: string;
    address?: string | null;
    numberOfCourts?: number | null;
  } | null;
}

export function buildClubMetadata(club: ClubActivityDetails): ClubMetadata {
  return {
    clubId: club.id,
    clubSlug: club.slug ?? null,
    clubName: club.name,
    logo: club.logo ?? null,
    venueName: club.defaultVenue?.name ?? null,
    venueAddress: club.defaultVenue?.address ?? null,
    numberOfCourts: club.defaultVenue?.numberOfCourts ?? null,
    description: toDescriptionExcerpt(club.description),
  };
}

export function buildClubJoinMetadata(
  club: ClubActivityDetails
): Pick<ClubMetadata, 'schedules' | 'joinPolicy' | 'requiredLevels'> {
  return {
    // Inactive slots are switched off, not deleted — a reader shouldn't see them.
    schedules: club.schedules
      .filter((s) => s.isActive)
      .map(({ dayOfWeek, startTime, endTime }) => ({
        dayOfWeek,
        startTime,
        endTime,
      })),
    joinPolicy: club.joinPolicy,
    requiredLevels: club.requiredLevels,
  };
}
