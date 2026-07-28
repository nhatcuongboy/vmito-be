import { resolveCrawledSessionLocation } from './crawled-location.util';

describe('resolveCrawledSessionLocation', () => {
  it('links the venue and writes no custom snapshot when the venue is verified', () => {
    const result = resolveCrawledSessionLocation(
      {
        venueId: 'venue-abc',
        location: 'Sân ABC, Quận 7',
        venue: {
          name: 'ABC Badminton',
          address: '123 Nguyễn Văn Linh',
          district: 'Quận 7',
          city: 'Hồ Chí Minh',
        },
      },
      { id: 'venue-abc', name: 'ABC Badminton' }
    );

    expect(result.venueId).toBe('venue-abc');
    expect(result.location).toBe('Sân ABC, Quận 7');
    expect(result.customLocationName).toBeNull();
    expect(result.customLocationAddress).toBeNull();
    expect(result.customLocationDistrict).toBeNull();
    expect(result.customLocationCity).toBeNull();
  });

  it('writes a full custom snapshot when no venue matched', () => {
    const result = resolveCrawledSessionLocation(
      {
        location: 'Sân Không Có, Quận 1',
        venue: {
          name: 'Sân Không Có',
          address: '999 Xa Lạ',
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
        },
      },
      null
    );

    expect(result.venueId).toBeUndefined();
    expect(result.customLocationName).toBe('Sân Không Có');
    expect(result.customLocationAddress).toBe('999 Xa Lạ');
    expect(result.customLocationDistrict).toBe('Quận 1');
    expect(result.customLocationCity).toBe('Hồ Chí Minh');
    // Legacy readers keep working off `location`.
    expect(result.location).toBe('Sân Không Có');
    expect(result.searchTerms).toEqual([
      'Sân Không Có',
      '999 Xa Lạ',
      'Quận 1',
      'Hồ Chí Minh',
    ]);
  });

  it('prefers the new administrative units over the legacy ones', () => {
    const result = resolveCrawledSessionLocation(
      {
        venue: {
          name: 'Sân XYZ',
          district: 'Quận 2',
          city: 'Hồ Chí Minh',
          newDistrict: 'Phường Thủ Thiêm',
          newCity: 'TP. Hồ Chí Minh',
        },
      },
      null
    );

    expect(result.customLocationDistrict).toBe('Phường Thủ Thiêm');
    expect(result.customLocationCity).toBe('TP. Hồ Chí Minh');
  });

  it('still produces a custom location from a free-form location only', () => {
    const result = resolveCrawledSessionLocation(
      { location: 'Nhà thi đấu Phú Thọ' },
      null
    );

    expect(result.customLocationName).toBe('Nhà thi đấu Phú Thọ');
    expect(result.customLocationAddress).toBeNull();
    expect(result.location).toBe('Nhà thi đấu Phú Thọ');
  });

  it('never repeats the name as the address', () => {
    const result = resolveCrawledSessionLocation(
      { venue: { name: 'Sân ABC', address: 'Sân ABC' } },
      null
    );

    expect(result.customLocationName).toBe('Sân ABC');
    expect(result.customLocationAddress).toBeNull();
  });

  it('never emits an unverified placeId or coordinates', () => {
    const result = resolveCrawledSessionLocation(
      { venue: { name: 'Sân ABC', address: '1 Lê Lợi' } },
      null
    );

    expect(result.customLocationPlaceId).toBeNull();
    expect(result.customLocationLat).toBeNull();
    expect(result.customLocationLng).toBeNull();
  });
});
