import { HOST_MIN_ACTIVE_PLAYERS } from './points.constants';
import {
  countsTowardHostBonus,
  PointEntry,
  sessionCompletionEntries,
} from './points.service';

const HOST = 'host-1';
const SESSION = 'session-1';
const AT = new Date('2026-10-01T12:00:00Z');

type Player = {
  userId: string | null;
  createdByUserId: string | null;
  matchesPlayed: number;
};

const selfRegistered = (userId: string, matchesPlayed = 1): Player => ({
  userId,
  createdByUserId: userId,
  matchesPlayed,
});

const hostAttached = (userId: string, matchesPlayed = 1): Player => ({
  userId,
  createdByUserId: HOST,
  matchesPlayed,
});

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

const run = (players: Player[], overrides = {}) =>
  sessionCompletionEntries(
    { hostId: HOST, isCrawled: false, players, ...overrides },
    SESSION,
    AT
  );

const hostEntries = (entries: PointEntry[]) =>
  entries.filter((e) => e.reason === 'SESSION_HOSTED');

const participants = (entries: PointEntry[]) =>
  entries
    .filter((e) => e.reason === 'SESSION_PARTICIPATION')
    .map((e) => e.userId)
    .sort();

describe('countsTowardHostBonus', () => {
  it('accepts an account that registered itself', () => {
    expect(countsTowardHostBonus(selfRegistered('u1'), HOST)).toBe(true);
  });

  it('rejects a slot the host created and linked to an account', () => {
    expect(countsTowardHostBonus(hostAttached('u1'), HOST)).toBe(false);
  });

  it('rejects a slot with no creator recorded', () => {
    expect(
      countsTowardHostBonus(
        { userId: 'u1', createdByUserId: null, matchesPlayed: 1 },
        HOST
      )
    ).toBe(false);
  });

  it('rejects guests and the host themself', () => {
    expect(
      countsTowardHostBonus(
        { userId: null, createdByUserId: null, matchesPlayed: 1 },
        HOST
      )
    ).toBe(false);
    expect(countsTowardHostBonus(selfRegistered(HOST), HOST)).toBe(false);
  });
});

describe('sessionCompletionEntries', () => {
  it('awards the host once enough self-registered accounts played', () => {
    const entries = run(
      ids('u', HOST_MIN_ACTIVE_PLAYERS).map((id) => selfRegistered(id))
    );
    expect(hostEntries(entries)).toEqual([
      {
        userId: HOST,
        sport: 'BADMINTON',
        reason: 'SESSION_HOSTED',
        refType: 'SESSION',
        refId: SESSION,
        occurredAt: AT,
      },
    ]);
  });

  it('does not count accounts the host attached to slots', () => {
    const players = [
      ...ids('self', HOST_MIN_ACTIVE_PLAYERS - 1).map((id) =>
        selfRegistered(id)
      ),
      ...ids('attached', 5).map((id) => hostAttached(id)),
    ];
    expect(hostEntries(run(players))).toHaveLength(0);
  });

  it('does not count the host playing in their own session', () => {
    const players = [
      ...ids('self', HOST_MIN_ACTIVE_PLAYERS - 1).map((id) =>
        selfRegistered(id)
      ),
      selfRegistered(HOST),
    ];
    expect(hostEntries(run(players))).toHaveLength(0);
  });

  it('ignores self-registered accounts that never played', () => {
    const players = [
      ...ids('self', HOST_MIN_ACTIVE_PLAYERS - 1).map((id) =>
        selfRegistered(id)
      ),
      selfRegistered('bench', 0),
    ];
    expect(hostEntries(run(players))).toHaveLength(0);
  });

  it('counts an account with several slots once', () => {
    const players = [
      ...ids('self', HOST_MIN_ACTIVE_PLAYERS - 1).map((id) =>
        selfRegistered(id)
      ),
      selfRegistered('self-0'),
    ];
    expect(hostEntries(run(players))).toHaveLength(0);
  });

  it('never awards crawled or hostless sessions', () => {
    const players = ids('u', HOST_MIN_ACTIVE_PLAYERS).map((id) =>
      selfRegistered(id)
    );
    expect(hostEntries(run(players, { isCrawled: true }))).toHaveLength(0);
    expect(hostEntries(run(players, { hostId: null }))).toHaveLength(0);
  });

  it('keeps participation points for every linked account that played', () => {
    const entries = run([
      selfRegistered('self'),
      hostAttached('attached'),
      selfRegistered(HOST),
      selfRegistered('bench', 0),
      { userId: null, createdByUserId: HOST, matchesPlayed: 3 },
    ]);
    expect(participants(entries)).toEqual(['attached', HOST, 'self'].sort());
  });
});
