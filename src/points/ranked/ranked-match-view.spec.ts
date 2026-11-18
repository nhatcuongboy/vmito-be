import { myExclusion, sessionOrganizerIds } from './ranked-match-view';

describe('myExclusion', () => {
  it('is ORGANIZER for the host even when the match counts for others', () => {
    expect(
      myExclusion({
        isOrganizer: true,
        status: 'VERIFIED',
        ineligibleReason: null,
      })
    ).toBe('ORGANIZER');
  });

  it('uses the ineligible reason for ineligible matches', () => {
    expect(
      myExclusion({
        isOrganizer: false,
        status: 'INELIGIBLE',
        ineligibleReason: 'TOO_SHORT',
      })
    ).toBe('TOO_SHORT');
  });

  it('is null when the viewer earned from the match', () => {
    expect(
      myExclusion({
        isOrganizer: false,
        status: 'VERIFIED',
        ineligibleReason: null,
      })
    ).toBeNull();
  });
});

describe('sessionOrganizerIds', () => {
  it('includes the host and every co-host', () => {
    expect(
      [
        ...sessionOrganizerIds({ hostId: 'h', managers: [{ userId: 'm' }] }),
      ].sort()
    ).toEqual(['h', 'm']);
  });
});
