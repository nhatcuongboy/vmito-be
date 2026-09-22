import { BadRequestException } from '@nestjs/common';
import {
  Category,
  CategoryRegistrationMode,
  Tournament,
  TournamentStatus,
} from '@prisma/client';

type TournamentGate = Pick<
  Tournament,
  'registrationOpen' | 'registrationDeadline' | 'isPublished' | 'status'
>;

type CategoryGate = Pick<
  Category,
  'registrationEnabled' | 'maxRegistrations' | 'registrationMode' | 'teamSize'
>;

/** Why a tournament currently refuses new requests, or null when it accepts them. */
export function tournamentClosedReason(
  tournament: TournamentGate,
  now = new Date()
): string | null {
  if (!tournament.registrationOpen) return 'Registration is not open';
  if (!tournament.isPublished) return 'Tournament is not published';
  if (tournament.status !== TournamentStatus.PREPARING) {
    return 'Tournament is no longer accepting registrations';
  }
  if (
    tournament.registrationDeadline &&
    now.getTime() >= tournament.registrationDeadline.getTime()
  ) {
    return 'Registration deadline has passed';
  }
  return null;
}

export function assertTournamentAcceptingRegistrations(
  tournament: TournamentGate,
  now = new Date()
): void {
  const reason = tournamentClosedReason(tournament, now);
  if (reason) throw new BadRequestException(reason);
}

/**
 * Approval only needs the tournament to still be in preparation — organizers
 * may review pending requests after registration closed or the deadline passed.
 */
export function assertTournamentReviewable(
  tournament: Pick<Tournament, 'status'>
): void {
  if (tournament.status !== TournamentStatus.PREPARING) {
    throw new BadRequestException(
      'Registrations can only be reviewed while the tournament is preparing'
    );
  }
}

/**
 * A category that already has matches is locked: adding entrants would not be
 * reflected in its groups/bracket, so its existing results stay untouched.
 */
export function categoryClosedReason(
  category: CategoryGate,
  counts: { matchCount: number; registrationCount: number },
  options: { ignoreEnabledFlag?: boolean } = {}
): string | null {
  if (!options.ignoreEnabledFlag && !category.registrationEnabled) {
    return 'This category is not accepting registrations';
  }
  if (counts.matchCount > 0) {
    return 'Matches have already been generated for this category';
  }
  if (
    category.maxRegistrations !== null &&
    counts.registrationCount >= category.maxRegistrations
  ) {
    return 'This category is full';
  }
  return null;
}

export function assertCategoryAcceptingRegistrations(
  category: CategoryGate,
  counts: { matchCount: number; registrationCount: number },
  options: { ignoreEnabledFlag?: boolean } = {}
): void {
  const reason = categoryClosedReason(category, counts, options);
  if (reason) throw new BadRequestException(reason);
}

export interface NormalizedRoster {
  partnerUserIds: string[];
  guestPartnerNames: string[];
}

/**
 * INDIVIDUAL categories take the requester alone; TEAM categories need exactly
 * `teamSize` members (requester + Vmito partners + guest partners).
 */
export function normalizeRoster(
  category: Pick<Category, 'registrationMode' | 'teamSize'>,
  requesterId: string,
  partnerUserIds: string[] = [],
  guestPartnerNames: string[] = []
): NormalizedRoster {
  const partners = partnerUserIds.map((id) => id.trim()).filter(Boolean);
  const guests = guestPartnerNames.map((name) => name.trim()).filter(Boolean);

  if (new Set(partners).size !== partners.length) {
    throw new BadRequestException('Duplicate partner');
  }
  if (partners.includes(requesterId)) {
    throw new BadRequestException('You cannot add yourself as a partner');
  }

  if (category.registrationMode === CategoryRegistrationMode.INDIVIDUAL) {
    if (partners.length > 0 || guests.length > 0) {
      throw new BadRequestException(
        'Individual categories do not accept partners'
      );
    }
    return { partnerUserIds: [], guestPartnerNames: [] };
  }

  const rosterSize = 1 + partners.length + guests.length;
  if (rosterSize !== category.teamSize) {
    throw new BadRequestException(
      `This category requires ${category.teamSize} team members`
    );
  }
  return { partnerUserIds: partners, guestPartnerNames: guests };
}
