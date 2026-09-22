import { BadRequestException } from '@nestjs/common';
import {
  assertCategoryAcceptingRegistrations,
  assertTournamentReviewable,
  categoryClosedReason,
  normalizeRoster,
  tournamentClosedReason,
} from './registration-eligibility.helper';

const openTournament = {
  registrationOpen: true,
  registrationDeadline: null as Date | null,
  isPublished: true,
  status: 'PREPARING' as const,
};

const category = {
  registrationEnabled: true,
  maxRegistrations: null as number | null,
  registrationMode: 'TEAM' as const,
  teamSize: 2,
};

const noCounts = { matchCount: 0, registrationCount: 0 };

describe('tournamentClosedReason', () => {
  const now = new Date('2026-09-23T10:00:00Z');

  it('accepts an open, published, preparing tournament', () => {
    expect(tournamentClosedReason(openTournament, now)).toBeNull();
  });

  it.each([
    [{ registrationOpen: false }, 'Registration is not open'],
    [{ isPublished: false }, 'Tournament is not published'],
    [
      { status: 'IN_PROGRESS' as const },
      'Tournament is no longer accepting registrations',
    ],
    [
      { status: 'FINISHED' as const },
      'Tournament is no longer accepting registrations',
    ],
    [
      { registrationDeadline: new Date('2026-09-23T10:00:00Z') },
      'Registration deadline has passed',
    ],
  ])('rejects %o', (override, reason) => {
    expect(
      tournamentClosedReason({ ...openTournament, ...override }, now)
    ).toBe(reason);
  });

  it('accepts before the deadline', () => {
    expect(
      tournamentClosedReason(
        {
          ...openTournament,
          registrationDeadline: new Date('2026-09-23T10:00:01Z'),
        },
        now
      )
    ).toBeNull();
  });
});

describe('assertTournamentReviewable', () => {
  it('only allows reviewing while preparing', () => {
    expect(() =>
      assertTournamentReviewable({ status: 'PREPARING' })
    ).not.toThrow();
    expect(() => assertTournamentReviewable({ status: 'FINISHED' })).toThrow(
      BadRequestException
    );
  });
});

describe('categoryClosedReason', () => {
  it('accepts an enabled, empty category', () => {
    expect(categoryClosedReason(category, noCounts)).toBeNull();
  });

  it('rejects a disabled category unless the flag is ignored', () => {
    const disabled = { ...category, registrationEnabled: false };
    expect(categoryClosedReason(disabled, noCounts)).toBe(
      'This category is not accepting registrations'
    );
    expect(
      categoryClosedReason(disabled, noCounts, { ignoreEnabledFlag: true })
    ).toBeNull();
  });

  it('locks a category once matches exist', () => {
    expect(
      categoryClosedReason(
        category,
        { matchCount: 1, registrationCount: 0 },
        {
          ignoreEnabledFlag: true,
        }
      )
    ).toBe('Matches have already been generated for this category');
  });

  it('rejects a full category', () => {
    expect(() =>
      assertCategoryAcceptingRegistrations(
        { ...category, maxRegistrations: 2 },
        { matchCount: 0, registrationCount: 2 }
      )
    ).toThrow('This category is full');
    expect(
      categoryClosedReason(
        { ...category, maxRegistrations: 2 },
        { matchCount: 0, registrationCount: 1 }
      )
    ).toBeNull();
  });
});

describe('normalizeRoster', () => {
  it('accepts a full doubles team of a user and a guest', () => {
    expect(normalizeRoster(category, 'u1', [], [' Guest '])).toEqual({
      partnerUserIds: [],
      guestPartnerNames: ['Guest'],
    });
    expect(normalizeRoster(category, 'u1', ['u2'], [])).toEqual({
      partnerUserIds: ['u2'],
      guestPartnerNames: [],
    });
  });

  it('requires exactly teamSize members', () => {
    expect(() => normalizeRoster(category, 'u1')).toThrow(
      'This category requires 2 team members'
    );
    expect(() => normalizeRoster(category, 'u1', ['u2'], ['Guest'])).toThrow(
      'This category requires 2 team members'
    );
  });

  it('rejects self and duplicate partners', () => {
    expect(() => normalizeRoster(category, 'u1', ['u1'])).toThrow(
      'You cannot add yourself as a partner'
    );
    expect(() =>
      normalizeRoster({ ...category, teamSize: 3 }, 'u1', ['u2', 'u2'])
    ).toThrow('Duplicate partner');
  });

  it('rejects partners in individual categories', () => {
    const individual = { registrationMode: 'INDIVIDUAL' as const, teamSize: 1 };
    expect(normalizeRoster(individual, 'u1')).toEqual({
      partnerUserIds: [],
      guestPartnerNames: [],
    });
    expect(() => normalizeRoster(individual, 'u1', ['u2'])).toThrow(
      'Individual categories do not accept partners'
    );
  });
});
