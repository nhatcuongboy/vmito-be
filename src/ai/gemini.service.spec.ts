import { GeminiService } from './gemini.service';
import { Language } from '../common/constants/language.enum';

const getDatePartsInVietnam = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
  };
};

describe('GeminiService.extractSessionFromArticle', () => {
  let service: GeminiService;
  let generateContent: jest.Mock;
  let venueFindMany: jest.Mock;

  const makeRawSession = (overrides: Record<string, unknown> = {}) => ({
    name: 'Kèo cầu lông Sân ABC',
    description: 'Tuyển vãng lai',
    notes: null,
    location: null,
    hostName: 'Anh Nam',
    hostPhone: '0901 234 567',
    startTime: '2026-05-16T18:00:00',
    endTime: '2026-05-16T20:00:00',
    sessionDuration: null,
    maxPlayersPerCourt: null,
    requiredLevels: null,
    venue: null,
    numberOfCourts: null,
    courts: null,
    courtNames: null,
    shuttlecock: null,
    defaultMatchType: null,
    feeConfig: null,
    ...overrides,
  });

  const mockAiResponse = (payload: Record<string, unknown>) => {
    generateContent.mockResolvedValue({ text: JSON.stringify(payload) });
  };

  beforeEach(() => {
    generateContent = jest.fn();
    venueFindMany = jest.fn().mockResolvedValue([]);

    service = new GeminiService(
      { get: jest.fn().mockReturnValue('test-api-key') } as never,
      { venue: { findMany: venueFindMany } } as never
    );
    (service as unknown as { ai: unknown }).ai = {
      models: { generateContent },
    };
  });

  it('extracts Session.location separately from structured venue', async () => {
    mockAiResponse(
      makeRawSession({
        location: 'Sân ABC, Quận 7',
        venue: {
          name: 'Sân ABC',
          address: null,
          district: 'Quận 7',
          city: 'Hồ Chí Minh',
        },
      })
    );

    const result = await service.extractSessionFromArticle(
      'Địa điểm: Sân ABC, Quận 7',
      Language.VI
    );

    expect(result.location).toBe('Sân ABC, Quận 7');
    expect(result.venue).toMatchObject({
      name: 'Sân ABC',
      district: 'Quận 7',
      city: 'Hồ Chí Minh',
    });
  });

  it('converts specific court names into actual court config', async () => {
    mockAiResponse(
      makeRawSession({
        numberOfCourts: 2,
        courtNames: ['3', '4'],
      })
    );

    const result = await service.extractSessionFromArticle(
      'Đánh 2 sân (3 và 4)',
      Language.VI
    );

    expect(result.numberOfCourts).toBe(2);
    expect(result.courtNames).toEqual(['3', '4']);
    expect(result.courts).toEqual([
      { courtNumber: 3, courtName: '3', direction: 'HORIZONTAL' },
      { courtNumber: 4, courtName: '4', direction: 'HORIZONTAL' },
    ]);
  });

  it('uses the current Vietnam date instruction when the post has only time', async () => {
    const currentDate = getDatePartsInVietnam();
    const date = `${currentDate.year}-${currentDate.month}-${currentDate.day}`;
    mockAiResponse(
      makeRawSession({
        startTime: `${date}T18:00:00`,
        endTime: `${date}T20:00:00`,
      })
    );

    const result = await service.extractSessionFromArticle(
      '18h-20h',
      Language.VI
    );
    const calls = generateContent.mock.calls as unknown as Array<
      [{ contents: string }]
    >;
    expect(calls[0]?.[0].contents).toContain(
      `Current date in Vietnam timezone: ${date}`
    );
    expect(result.startTime).toBe(
      new Date(`${date}T18:00:00+07:00`).toISOString()
    );
    expect(result.endTime).toBe(
      new Date(`${date}T20:00:00+07:00`).toISOString()
    );
    expect(result.sessionDuration).toBe(120);
  });

  it('normalizes fees and level ranges', async () => {
    mockAiResponse(
      makeRawSession({
        requiredLevels: ['TB- đến Khá'],
        feeConfig: {
          feeType: 'FIXED',
          maleFee: '50k',
          femaleFee: '40k',
          notes: 'Bao sân',
        },
      })
    );

    const result = await service.extractSessionFromArticle(
      'Trình TB- đến khá. Nam 50k, Nữ 40k',
      Language.VI
    );

    expect(result.requiredLevels).toEqual([3, 4, 5, 6]);
    expect(result.feeConfig).toEqual({
      feeType: 'FIXED',
      maleFee: 50000,
      femaleFee: 40000,
      notes: 'Bao sân',
    });
  });

  it('sets venueId and canonical venue when database match is confident', async () => {
    venueFindMany.mockResolvedValue([
      {
        id: 'venue-abc',
        name: 'ABC Badminton',
        acronym: 'ABC',
        address: '123 Nguyễn Văn Linh',
        district: '7',
        city: 'Hồ Chí Minh',
        newAddress: null,
        newDistrict: null,
        newCity: null,
        searchTerms: 'abc badminton 123 nguyen van linh 7 ho chi minh',
      },
    ]);
    mockAiResponse(
      makeRawSession({
        location: null,
        venue: {
          name: 'Sân ABC',
          address: '123 Nguyễn Văn Linh',
          district: 'Quận 7',
          city: 'Hồ Chí Minh',
        },
      })
    );

    const result = await service.extractSessionFromArticle(
      'Địa điểm: Sân ABC, 123 Nguyễn Văn Linh, Quận 7',
      Language.VI
    );

    expect(result.venueId).toBe('venue-abc');
    expect(result.venue).toMatchObject({
      name: 'ABC Badminton',
      address: '123 Nguyễn Văn Linh',
      district: '7',
      city: 'Hồ Chí Minh',
    });
    expect(result.location).toBe('Sân ABC, 123 Nguyễn Văn Linh');
  });

  it('never asks the model for a venueId or placeId', async () => {
    mockAiResponse(makeRawSession());

    await service.extractSessionFromArticle('Kèo tối nay', Language.VI);

    const calls = generateContent.mock.calls as unknown as Array<
      [{ config: { responseSchema: Record<string, unknown> } }]
    >;
    const schema = calls[0][0].config.responseSchema;
    const properties = schema.properties as Record<string, unknown>;
    const venueProperties = (
      properties.venue as { properties: Record<string, unknown> }
    ).properties;

    expect(properties.venueId).toBeUndefined();
    expect(schema.required).not.toContain('venueId');
    expect(schema.propertyOrdering).not.toContain('venueId');
    expect(venueProperties.placeId).toBeUndefined();
  });

  it('ignores a venueId and placeId hallucinated by the model', async () => {
    venueFindMany.mockResolvedValue([]);
    mockAiResponse(
      makeRawSession({
        venueId: 'venue-hallucinated',
        venue: {
          placeId: 'ChIJ_fake_place_id',
          name: 'Sân Không Có',
          address: '999 Xa Lạ',
          district: null,
          city: null,
        },
      })
    );

    const result = await service.extractSessionFromArticle(
      'Địa điểm: Sân Không Có',
      Language.VI
    );

    expect(result.venueId).toBeUndefined();
    expect(
      (result.venue as Record<string, unknown> | undefined)?.placeId
    ).toBeUndefined();
    // The extracted text itself is preserved as a custom-location candidate.
    expect(result.venue?.name).toBe('Sân Không Có');
  });

  it('does not set venueId for weak venue matches', async () => {
    venueFindMany.mockResolvedValue([
      {
        id: 'venue-abc',
        name: 'ABC Badminton',
        acronym: 'ABC',
        address: '123 Nguyễn Văn Linh',
        district: '7',
        city: 'Hồ Chí Minh',
        newAddress: null,
        newDistrict: null,
        newCity: null,
        searchTerms: 'abc badminton 123 nguyen van linh 7 ho chi minh',
      },
    ]);
    mockAiResponse(
      makeRawSession({
        venue: {
          name: 'Sân Không Có',
          address: '999 Xa Lạ',
          district: 'Quận 1',
          city: 'Hồ Chí Minh',
        },
      })
    );

    const result = await service.extractSessionFromArticle(
      'Địa điểm: Sân Không Có, 999 Xa Lạ',
      Language.VI
    );

    expect(result.venueId).toBeUndefined();
    // Weak match keeps the AI data so callers can build a custom location.
    expect(result.venue).toMatchObject({
      name: 'Sân Không Có',
      address: '999 Xa Lạ',
      district: 'Quận 1',
      city: 'Hồ Chí Minh',
    });
    expect(result.location).toBe('Sân Không Có, 999 Xa Lạ');
  });

  it('passes through isRecruitmentPost=true for a genuine recruitment post', async () => {
    mockAiResponse(
      makeRawSession({ isRecruitmentPost: true, nonRecruitmentReason: null })
    );

    const result = await service.extractSessionFromArticle(
      'Tuyển vãng lai tối nay 18h-20h sân ABC',
      Language.VI
    );

    expect(result.isRecruitmentPost).toBe(true);
    expect(result.nonRecruitmentReason).toBeUndefined();
  });

  it('flags a class ad as isRecruitmentPost=false with a reason', async () => {
    mockAiResponse(
      makeRawSession({
        isRecruitmentPost: false,
        nonRecruitmentReason: 'class ad',
        startTime: null,
        endTime: null,
      })
    );

    const result = await service.extractSessionFromArticle(
      'Khai giảng lớp học cầu lông cho người mới, học phí 500k/khoá',
      Language.VI
    );

    expect(result.isRecruitmentPost).toBe(false);
    expect(result.nonRecruitmentReason).toBe('class ad');
  });

  describe('sport type', () => {
    const makeVenue = (overrides: Record<string, unknown> = {}) => ({
      id: 'venue-1',
      name: 'Sân ABC',
      acronym: null,
      address: '123 Nguyễn Văn Linh',
      district: 'Quận 7',
      city: 'Hồ Chí Minh',
      newAddress: null,
      newDistrict: null,
      newCity: null,
      searchTerms: 'san cau long san abc',
      sportType: 'BADMINTON',
      ...overrides,
    });

    it('keeps the sport extracted from the post', async () => {
      mockAiResponse(makeRawSession({ sportType: 'PICKLEBALL' }));

      const result = await service.extractSessionFromArticle(
        'Kèo pickleball tối nay',
        Language.VI
      );

      expect(result.sportType).toBe('PICKLEBALL');
    });

    it('only matches venues offering the extracted sport', async () => {
      venueFindMany.mockResolvedValue([
        makeVenue({
          sportType: 'PICKLEBALL',
          searchTerms: 'san pickleball abc',
        }),
      ]);
      mockAiResponse(
        makeRawSession({
          sportType: 'PICKLEBALL',
          venue: { name: 'Sân ABC', address: '123 Nguyễn Văn Linh' },
        })
      );

      await service.extractSessionFromArticle('Kèo pickleball', Language.VI);

      const [{ where }] = venueFindMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(where.sportTypes).toEqual({ has: 'PICKLEBALL' });
    });

    it('falls back to the matched venue sport when the post does not state one', async () => {
      venueFindMany.mockResolvedValue([makeVenue({ sportType: 'PICKLEBALL' })]);
      mockAiResponse(
        makeRawSession({
          sportType: null,
          venue: { name: 'Sân ABC', address: '123 Nguyễn Văn Linh' },
        })
      );

      const result = await service.extractSessionFromArticle(
        'Kèo tối nay sân ABC',
        Language.VI
      );

      expect(result.venueId).toBe('venue-1');
      expect(result.sportType).toBe('PICKLEBALL');
    });

    it('defaults to BADMINTON when neither the post nor a venue resolves the sport', async () => {
      mockAiResponse(makeRawSession({ sportType: null }));

      const result = await service.extractSessionFromArticle(
        'Kèo tối nay',
        Language.VI
      );

      expect(result.sportType).toBe('BADMINTON');
    });
  });
});
