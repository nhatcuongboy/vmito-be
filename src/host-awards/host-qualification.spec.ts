import { DAY_MS } from './host-awards.constants';
import { at, MONTH_START, session, user } from './host-awards.fixtures';
import {
  applySessionCaps,
  countedPlayers,
  guestKey,
  qualifySession,
  SessionVerdict,
} from './host-qualification';

const players = ['u1', 'u2', 'u3', 'u4'];
const users = new Map(
  ['host', ...players].map((id) => [id, user(id)] as const)
);

describe('host qualification', () => {
  it('qualifies a real two-hour session with four self-registered players', () => {
    const verdict = qualifySession(
      session('s1', 'host', at(5), players),
      users,
      new Set()
    );
    expect(verdict?.qualified).toBe(true);
    expect(verdict?.verifiedUserIds.sort()).toEqual(players);
  });

  it('ignores slots the host linked to other accounts', () => {
    const s = session('s1', 'host', at(5), players, { hostLinked: true });
    expect(countedPlayers(s, users, new Set()).userIds).toEqual([]);
    expect(qualifySession(s, users, new Set())?.rejection).toBe(
      'TOO_FEW_PLAYERS'
    );
  });

  it('never counts the host themself', () => {
    const s = session('s1', 'host', at(5), ['host', 'u1', 'u2', 'u3']);
    expect(countedPlayers(s, users, new Set()).userIds).not.toContain('host');
  });

  it('rejects sessions shorter than an hour', () => {
    const s = session('s1', 'host', at(5), players, { minutes: 30 });
    expect(qualifySession(s, users, new Set())?.rejection).toBe('TOO_SHORT');
  });

  it('rejects sessions whose matches are too short to be real', () => {
    const s = session('s1', 'host', at(5), players, { matchMinutes: 2 });
    expect(qualifySession(s, users, new Set())?.rejection).toBe(
      'TOO_FEW_MATCHES'
    );
  });

  it('needs only one recorded match, but at least one', () => {
    const one = session('s1', 'host', at(5), players, { matchCount: 1 });
    expect(qualifySession(one, users, new Set())?.qualified).toBe(true);
    const none = session('s2', 'host', at(5), players, { matchCount: 0 });
    expect(qualifySession(none, users, new Set())?.rejection).toBe(
      'TOO_FEW_MATCHES'
    );
  });

  it('skips brand-new accounts and excluded (device-shared) accounts', () => {
    const fresh = new Map(users);
    fresh.set('u1', user('u1', { createdAt: at(4) }));
    const s = session('s1', 'host', at(5), players);
    expect(countedPlayers(s, fresh, new Set(['u2'])).userIds.sort()).toEqual([
      'u3',
      'u4',
    ]);
  });

  it('counts named guests who played, so a mostly-guest session qualifies', () => {
    const s = session('s1', 'host', at(5), ['u1'], {
      guests: ['Hùng', 'Lan', 'Minh'],
    });
    const verdict = qualifySession(s, users, new Set());
    expect(verdict?.qualified).toBe(true);
    expect(verdict?.verifiedUserIds).toEqual(['u1']);
    expect(verdict?.guestKeys).toHaveLength(3);
  });

  it('counts a guest once however the name is written', () => {
    const s = session('s1', 'host', at(5), [], {
      guests: ['Hùng', ' hung ', 'HUNG', 'Đạt', 'dat'],
    });
    expect(countedPlayers(s, users, new Set()).guestKeys.sort()).toEqual([
      'name:dat',
      'name:hung',
    ]);
  });

  it('ignores guests with no name and no roster profile', () => {
    const s = session('s1', 'host', at(5), [], { guests: ['', '   '] });
    expect(countedPlayers(s, users, new Set()).guestKeys).toEqual([]);
  });

  it('ignores guests who never played in a real match', () => {
    const s = session('s1', 'host', at(5), players, {
      guests: ['Hùng', 'Lan'],
      matchMinutes: 2,
    });
    expect(countedPlayers(s, users, new Set())).toEqual({
      userIds: [],
      guestKeys: [],
    });
  });

  it('identifies a guest by roster profile before name', () => {
    expect(
      guestKey({
        id: 'p',
        userId: null,
        createdByUserId: null,
        matchesPlayed: 1,
        name: 'Hùng',
        profileId: 'prof-1',
      })
    ).toBe('profile:prof-1');
  });

  it('still rejects a session with too few players of either kind', () => {
    const s = session('s1', 'host', at(5), ['u1', 'u2'], { guests: ['Lan'] });
    expect(qualifySession(s, users, new Set())?.rejection).toBe(
      'TOO_FEW_PLAYERS'
    );
  });

  it('caps counted sessions at two per Vietnam day', () => {
    const verdict = (id: string, end: Date): SessionVerdict => ({
      sessionId: id,
      hostId: 'host',
      endTime: end,
      qualified: true,
      rejection: null,
      verifiedUserIds: players,
      guestKeys: [],
      weight: 1,
    });
    // 23:30 VN on the 5th and 00:30 VN on the 6th fall on different days.
    const counted = applySessionCaps([
      verdict('a', at(5, 8)),
      verdict('b', at(5, 12)),
      verdict('c', at(5, 18)),
      verdict('d', at(5, 23, 30)),
      verdict('e', new Date(at(5, 23, 30).getTime() + 3_600_000)),
    ]);
    expect(counted.map((v) => v.sessionId)).toEqual(['a', 'b', 'e']);
  });

  it('caps counted sessions at thirty per month', () => {
    const verdicts = Array.from({ length: 40 }, (_, i) => ({
      sessionId: `s${i}`,
      hostId: 'host',
      endTime: new Date(MONTH_START.getTime() + (i / 2) * DAY_MS + 3_600_000),
      qualified: true,
      rejection: null,
      verifiedUserIds: players,
      guestKeys: [],
      weight: 1,
    }));
    expect(applySessionCaps(verdicts)).toHaveLength(30);
  });
});
