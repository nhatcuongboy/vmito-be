import {
  EligibilityInput,
  evaluateEligibility,
  isLateEdit,
} from './ranked-eligibility';

const START = new Date('2026-11-18T12:00:00Z');
const minutes = (n: number) => new Date(START.getTime() + n * 60_000);

function doubles(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    status: 'FINISHED',
    startTime: START,
    endTime: minutes(20),
    winnerIds: JSON.stringify(['p1', 'p2']),
    isDraw: false,
    isCrawledSession: false,
    players: [
      { playerId: 'p1', userId: 'u1' },
      { playerId: 'p2', userId: 'u2' },
      { playerId: 'p3', userId: 'u3' },
      { playerId: 'p4', userId: 'u4' },
    ],
    organizerUserIds: ['host'],
    ...overrides,
  };
}

describe('evaluateEligibility', () => {
  it('ranks every real player when the host did not play', () => {
    expect(evaluateEligibility(doubles())).toEqual({
      eligible: true,
      matchMinutes: 20,
      sides: [
        {
          reason: 'SESSION_MATCH_WIN',
          rankedUserIds: ['u1', 'u2'],
          opponentUserIds: ['u3', 'u4'],
          guestOpponents: 0,
        },
        {
          reason: 'SESSION_MATCH_LOSS',
          rankedUserIds: ['u3', 'u4'],
          opponentUserIds: ['u1', 'u2'],
          guestOpponents: 0,
        },
      ],
    });
  });

  it('gives the host nothing but keeps them as an opponent', () => {
    const result = evaluateEligibility(doubles({ organizerUserIds: ['u1'] }));
    expect(result).toMatchObject({
      eligible: true,
      sides: [
        { rankedUserIds: ['u2'], opponentUserIds: ['u3', 'u4'] },
        { rankedUserIds: ['u3', 'u4'], opponentUserIds: ['u1', 'u2'] },
      ],
    });
  });

  it('excludes co-hosts like the host', () => {
    const result = evaluateEligibility(
      doubles({ organizerUserIds: ['host', 'u3'] })
    );
    expect(result).toMatchObject({
      eligible: true,
      sides: [{ rankedUserIds: ['u1', 'u2'] }, { rankedUserIds: ['u4'] }],
    });
  });

  it('skips guests but counts them as opponents', () => {
    const result = evaluateEligibility(
      doubles({
        players: [
          { playerId: 'p1', userId: 'u1' },
          { playerId: 'p2', userId: null },
          { playerId: 'p3', userId: null },
          { playerId: 'p4', userId: 'u4' },
        ],
      })
    );
    expect(result).toMatchObject({
      eligible: true,
      sides: [
        { rankedUserIds: ['u1'], opponentUserIds: ['u4'], guestOpponents: 1 },
        { rankedUserIds: ['u4'], opponentUserIds: ['u1'], guestOpponents: 1 },
      ],
    });
  });

  it('is ineligible when only the host and guests played', () => {
    const result = evaluateEligibility(
      doubles({
        winnerIds: JSON.stringify(['p1']),
        players: [
          { playerId: 'p1', userId: 'host' },
          { playerId: 'p2', userId: null },
        ],
      })
    );
    expect(result).toEqual({ eligible: false, reason: 'NO_RANKED_PLAYER' });
  });

  it.each([
    [
      'the same account twice',
      {
        players: [
          ...doubles().players.slice(0, 3),
          { playerId: 'p4', userId: 'u1' },
        ],
      },
      'DUPLICATE_ACCOUNT',
    ],
    [
      'a winner id outside the match',
      { winnerIds: JSON.stringify(['p1', 'px']) },
      'INVALID_WINNERS',
    ],
    [
      'only one winner in doubles',
      { winnerIds: JSON.stringify(['p1']) },
      'INVALID_WINNERS',
    ],
    ['no result', { winnerIds: null }, 'NO_RESULT'],
    ['a draw', { isDraw: true, winnerIds: null }, 'DRAW'],
    ['a 5-minute match', { endTime: minutes(5) }, 'TOO_SHORT'],
    ['a crawled session', { isCrawledSession: true }, 'CRAWLED_SESSION'],
    ['an unfinished match', { status: 'IN_PROGRESS' }, 'NOT_FINISHED'],
  ] as [string, Partial<EligibilityInput>, string][])(
    'rejects %s',
    (_label, overrides, reason) => {
      expect(evaluateEligibility(doubles(overrides))).toEqual({
        eligible: false,
        reason,
      });
    }
  );
});

describe('isLateEdit', () => {
  it('flags edits more than 7 days after the match', () => {
    const end = new Date('2026-11-01T00:00:00Z');
    expect(isLateEdit(end, new Date('2026-11-07T23:00:00Z'))).toBe(false);
    expect(isLateEdit(end, new Date('2026-11-08T01:00:00Z'))).toBe(true);
  });
});
