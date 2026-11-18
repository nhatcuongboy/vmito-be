import {
  cappedPoints,
  countPriorOpponents,
  matchMultiplier,
  repeatMultiplier,
  vnDayRange,
} from './ranked-scoring';

describe('repeatMultiplier', () => {
  it('decays 1 → 0.5 → 0 for repeat opponents', () => {
    expect([0, 1, 2, 5].map(repeatMultiplier)).toEqual([1, 0.5, 0, 0]);
  });
});

describe('matchMultiplier', () => {
  it('averages the decay over both doubles opponents', () => {
    const prior = countPriorOpponents([['a', 'b'], ['a']]);
    // a: 2 prior → 0, b: 1 prior → 0.5
    expect(matchMultiplier(['a', 'b'], 0, prior)).toBe(0.25);
  });

  it('is full value against fresh opponents', () => {
    expect(matchMultiplier(['x', 'y'], 0, new Map())).toBe(1);
  });

  it('weighs guest opponents with the fixed guest multiplier', () => {
    const prior = countPriorOpponents([['a'], ['a']]);
    // a: 2 prior → 0, guest → 1
    expect(matchMultiplier(['a'], 1, prior)).toBe(0.5);
  });

  it('counts an opponent once per match even if listed twice', () => {
    expect(countPriorOpponents([['a', 'a']]).get('a')).toBe(1);
  });
});

describe('cappedPoints', () => {
  it('applies the multiplier', () => {
    expect(cappedPoints(10, 0.5, 0)).toBe(5);
  });

  it('stops at the daily cap', () => {
    expect(cappedPoints(10, 1, 45)).toBe(5);
    expect(cappedPoints(10, 1, 50)).toBe(0);
    expect(cappedPoints(10, 1, 80)).toBe(0);
  });
});

describe('vnDayRange', () => {
  it('uses the Vietnam calendar day', () => {
    // 2026-11-18 23:30 VN = 16:30 UTC
    const { start, end } = vnDayRange(new Date('2026-11-18T16:30:00Z'));
    expect(start.toISOString()).toBe('2026-11-17T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-18T17:00:00.000Z');
  });

  it('rolls over at VN midnight', () => {
    const { start } = vnDayRange(new Date('2026-11-18T17:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-18T17:00:00.000Z');
  });
});
