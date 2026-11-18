import { computeSignals, flagsFor, SignalRow } from './honor-signals';

const at = new Date('2026-11-10T12:00:00Z');
const daysBefore = (n: number) => new Date(at.getTime() - n * 86_400_000);

function row(overrides: Partial<SignalRow> = {}): SignalRow {
  return {
    reason: 'SESSION_MATCH_WIN',
    points: 10,
    opponentUserIds: ['a'],
    guestOpponents: 0,
    sessionHostId: 'h1',
    matchMinutes: 20,
    occurredAt: at,
    ...overrides,
  };
}

const ctx = {
  opponentCreatedAt: new Map<string, Date>(),
  sharedDeviceOpponents: 0,
  disputedOrRejected: 0,
  notParticipatedReports: 0,
};

describe('computeSignals / flagsFor', () => {
  it('raises no flags for varied opponents and hosts', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, i) =>
      row({ opponentUserIds: [id], sessionHostId: `h${i % 4}` })
    );
    const signals = computeSignals(rows, ctx);
    expect(signals.distinctOpponents).toBe(8);
    expect(signals.distinctHosts).toBe(4);
    expect(flagsFor(signals)).toEqual([]);
  });

  it('flags a farm: one host, same new opponent, short matches', () => {
    const rows = Array.from({ length: 10 }, () =>
      row({ opponentUserIds: ['puppet'], matchMinutes: 9 })
    );
    const signals = computeSignals(rows, {
      ...ctx,
      opponentCreatedAt: new Map([['puppet', daysBefore(2)]]),
      sharedDeviceOpponents: 1,
    });
    expect(signals.topOpponentsPointShare).toBe(1);
    expect(signals.topHostPointShare).toBe(1);
    expect(signals.newAccountOpponents).toBe(1);
    expect(flagsFor(signals)).toEqual(
      expect.arrayContaining([
        'CONCENTRATED_OPPONENTS',
        'SINGLE_HOST',
        'SHORT_MATCHES',
        'SHARED_DEVICE',
      ])
    );
  });

  it('flags points mostly earned against guests', () => {
    const rows = [
      row({ opponentUserIds: [], guestOpponents: 2, sessionHostId: 'h1' }),
      row({ opponentUserIds: [], guestOpponents: 1, sessionHostId: 'h2' }),
      row({ opponentUserIds: ['a'], sessionHostId: 'h3' }),
    ];
    const signals = computeSignals(rows, ctx);
    expect(signals.guestOpponentPointShare).toBe(0.67);
    expect(flagsFor(signals)).toContain('GUEST_OPPONENTS');
  });

  it('does not count old accounts as new', () => {
    const signals = computeSignals([row({ opponentUserIds: ['old'] })], {
      ...ctx,
      opponentCreatedAt: new Map([['old', daysBefore(30)]]),
    });
    expect(signals.newAccountOpponents).toBe(0);
  });

  it('flags NOT_PARTICIPATED reports', () => {
    const signals = computeSignals([row()], {
      ...ctx,
      notParticipatedReports: 1,
    });
    expect(flagsFor(signals)).toContain('NOT_PARTICIPATED_REPORTS');
  });
});
