import { DAY_MS } from './host-awards.constants';
import { at, MONTH_START, session, user } from './host-awards.fixtures';
import {
  applySessionCaps,
  qualifySession,
  SessionVerdict,
  verifiedPlayerUserIds,
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
    expect(verifiedPlayerUserIds(s, users, new Set())).toEqual([]);
    expect(qualifySession(s, users, new Set())?.rejection).toBe(
      'TOO_FEW_PLAYERS'
    );
  });

  it('never counts the host themself', () => {
    const s = session('s1', 'host', at(5), ['host', 'u1', 'u2', 'u3']);
    expect(verifiedPlayerUserIds(s, users, new Set())).not.toContain('host');
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

  it('skips brand-new accounts and excluded (device-shared) accounts', () => {
    const fresh = new Map(users);
    fresh.set('u1', user('u1', { createdAt: at(4) }));
    const s = session('s1', 'host', at(5), players);
    expect(verifiedPlayerUserIds(s, fresh, new Set(['u2'])).sort()).toEqual([
      'u3',
      'u4',
    ]);
  });

  it('counts unverified accounts only when they also play with another host', () => {
    const mixed = new Map(users);
    mixed.set('u1', user('u1', { trusted: false }));
    mixed.set(
      'u2',
      user('u2', { trusted: false, hostsPlayed: new Set(['host', 'other']) })
    );
    const s = session('s1', 'host', at(5), players);
    expect(verifiedPlayerUserIds(s, mixed, new Set()).sort()).toEqual([
      'u2',
      'u3',
      'u4',
    ]);
  });

  it('caps counted sessions at two per Vietnam day', () => {
    const verdict = (id: string, end: Date): SessionVerdict => ({
      sessionId: id,
      hostId: 'host',
      endTime: end,
      qualified: true,
      rejection: null,
      verifiedUserIds: players,
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
      weight: 1,
    }));
    expect(applySessionCaps(verdicts)).toHaveLength(30);
  });
});
