import { SessionsService } from './sessions.service';
import { ExtractedSessionDto } from '../ai/dto/extract-session.dto';

describe('SessionsService crawled session names', () => {
  it('prefixes a resolved venue with "Kèo sân"', async () => {
    const session = {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };
    const service = new SessionsService(
      {
        session,
        user: { findUnique: jest.fn().mockResolvedValue({ id: 'crawler' }) },
        venue: { findUnique: jest.fn() },
      } as never,
      { get: jest.fn().mockReturnValue('crawler') } as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never
    );
    const extracted: ExtractedSessionDto = {
      isRecruitmentPost: true,
      venue: { name: 'Sân ABC' },
      startTime: '2026-09-21T12:00:00.000Z',
    };

    await service.createCrawledSession(
      extracted,
      'https://www.facebook.com/groups/example/posts/1'
    );

    expect(session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Kèo sân Sân ABC' }),
      })
    );
  });
});
