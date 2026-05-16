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
    venueId: null,
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
  });
});
