import { DAY_MS } from './host-awards.constants';
import { at, dataset, MONTH_END, session, user } from './host-awards.fixtures';
import { detectDeviceSharing, reciprocalRatingIds } from './host-award-fraud';
import { computeGrowth } from './host-award-metrics';
import { evaluateMonth } from './host-award-pipeline';
import { AwardRating } from './host-awards.types';

const ids = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${prefix}${i}`);

/** Six sessions over the month, rotating through 16 players. */
function honestHost(hostId: string, playerPrefix: string) {
  const players = ids(playerPrefix, 16);
  const sessions = [3, 6, 10, 14, 18, 22].map((day, i) =>
    session(
      `${hostId}-s${i}`,
      hostId,
      at(day, 18),
      players.slice((i * 4) % 16, ((i * 4) % 16) + 8)
    )
  );
  return { sessions, users: [user(hostId), ...players.map((id) => user(id))] };
}

const rating = (
  id: string,
  sessionId: string,
  rater: string,
  rated: string,
  type: AwardRating['type'],
  value = 5
): AwardRating => ({
  id,
  sessionId,
  raterUserId: rater,
  ratedUserId: rated,
  type,
  rating: value,
  createdAt: at(25),
});

describe('host award fraud signals', () => {
  it('excludes accounts sharing a device with the host or each other', () => {
    const sharing = detectDeviceSharing(
      'host',
      ['a', 'b', 'c', 'd'],
      new Map([
        ['host', ['phone-1']],
        ['a', ['phone-1']],
        ['b', ['tablet']],
        ['c', ['tablet']],
        ['d', ['own']],
      ])
    );
    expect([...sharing.excludedUserIds].sort()).toEqual(['a', 'b', 'c']);
    expect(sharing.sharedWithHost).toBe(1);
    expect(sharing.sharedBetweenPlayers).toBe(2);
  });

  it('drops repeated reciprocal 5★ ratings between host and player', () => {
    const all = [0, 1, 2].flatMap((i) => [
      rating(`p${i}`, `s${i}`, 'friend', 'host', 'PLAYER_TO_HOST'),
      rating(`h${i}`, `s${i}`, 'host', 'friend', 'HOST_TO_PLAYER'),
    ]);
    const hostRatings = all.filter((r) => r.type === 'PLAYER_TO_HOST');
    expect([...reciprocalRatingIds(hostRatings, all, 'host')].sort()).toEqual([
      'p0',
      'p1',
      'p2',
    ]);
    expect(reciprocalRatingIds(hostRatings.slice(0, 2), all, 'host').size).toBe(
      0
    );
  });

  it('counts a newcomer only when they came back for another session', () => {
    const first = session('s1', 'host', at(5), ['new', 'stay', 'x', 'y']);
    const later = session('s2', 'other', at(20), ['stay', 'p', 'q', 'r']);
    const data = dataset([first, later], []);
    const counted = [
      {
        sessionId: 's1',
        hostId: 'host',
        endTime: first.endTime!,
        qualified: true,
        rejection: null,
        verifiedUserIds: ['new', 'stay'],
        weight: 1,
      },
    ];
    expect(computeGrowth(counted, data.participationByUser, data.asOf)).toBe(1);
  });
});

describe('evaluateMonth', () => {
  it('ranks an honest host and keeps a self-linking host out', () => {
    const honest = honestHost('honest', 'p');
    const fakeAccounts = ids('fake', 16);
    // Host attaches 16 accounts to its own slots across 8 short-ish sessions.
    const farmed = [2, 4, 6, 8, 12, 16, 20, 24].map((day, i) =>
      session(`farm-s${i}`, 'farmer', at(day, 9), fakeAccounts, {
        hostLinked: true,
      })
    );
    const result = evaluateMonth(
      dataset(
        [...honest.sessions, ...farmed],
        [...honest.users, user('farmer'), ...fakeAccounts.map((id) => user(id))]
      )
    );

    const byHost = new Map(result.hosts.map((h) => [h.hostId, h]));
    expect(byHost.get('honest')?.eligibility.eligible).toBe(true);
    expect(byHost.get('honest')?.metrics.distinctPlayers).toBe(16);
    expect(byHost.get('farmer')?.metrics.qualifiedSessions).toBe(0);
    expect(byHost.get('farmer')?.rejections).toEqual({ TOO_FEW_PLAYERS: 8 });
    expect(result.scored.map((s) => s.hostId)).toEqual(['honest']);
  });

  it('flags a closed cluster of fresh accounts red', () => {
    const players = ids('sock', 12);
    const sessions = [10, 14, 18, 22].map((day, i) =>
      session(`c-s${i}`, 'cluster', at(day, 18), players)
    );
    const fresh = new Date(MONTH_END.getTime() - 25 * DAY_MS);
    const result = evaluateMonth(
      dataset(sessions, [
        user('cluster'),
        ...players.map((id) => user(id, { createdAt: fresh })),
      ])
    );
    const host = result.hosts[0];
    expect(host.flags.map((f) => [f.code, f.severity])).toEqual(
      expect.arrayContaining([
        ['CLOSED_CLUSTER', 'red'],
        ['NEW_ACCOUNT_BURST', 'yellow'],
      ])
    );
    expect(host.trustFactor).toBeCloseTo(0.65);
  });

  it('evaluates a requested host even without sessions', () => {
    const result = evaluateMonth(dataset([], [user('newbie')]), {
      includeHostIds: ['newbie'],
    });
    const host = result.hosts[0];
    expect(host.hostId).toBe('newbie');
    expect(host.eligibility.requirements).toHaveLength(5);
    expect(host.eligibility.eligible).toBe(false);
  });

  it('marks hosts with too many cancellations as ineligible', () => {
    const honest = honestHost('honest', 'p');
    const result = evaluateMonth(
      dataset(honest.sessions, honest.users, {
        cancelledByHost: new Map([['honest', 4]]),
      })
    );
    const host = result.hosts[0];
    expect(host.metrics.cancelRate).toBeCloseTo(0.4);
    expect(host.eligibility.eligible).toBe(false);
  });
});
