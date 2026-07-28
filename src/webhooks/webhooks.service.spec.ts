import { WebhooksService } from './webhooks.service';
import { ExtractedSessionDto } from '../ai/dto/extract-session.dto';

describe('WebhooksService Apify ingest gates', () => {
  let service: WebhooksService;
  let extractSessionFromArticle: jest.Mock;
  let createCrawledSession: jest.Mock;

  const post = {
    text: 'Tuyển vãng lai tối nay',
    postUrl: 'https://facebook.com/groups/badminton/posts/1',
  };

  const extraction = (
    overrides: Partial<ExtractedSessionDto> = {}
  ): ExtractedSessionDto => ({
    isRecruitmentPost: true,
    startTime: '2026-08-01T11:00:00.000Z',
    venue: { name: 'Sân ABC' },
    ...overrides,
  });

  beforeEach(() => {
    extractSessionFromArticle = jest.fn();
    createCrawledSession = jest.fn().mockResolvedValue({ id: 'session-1' });

    service = new WebhooksService(
      { get: jest.fn() } as never,
      { extractSessionFromArticle } as never,
      { createCrawledSession } as never
    );
  });

  const ingest = (extracted: ExtractedSessionDto) => {
    extractSessionFromArticle.mockResolvedValue(extracted);
    return service.ingestApifyPosts({ items: [post] } as never);
  };

  it('imports a post that states both when and where', async () => {
    const result = await ingest(extraction());

    expect(result.imported).toBe(1);
    expect(result.skippedIncomplete).toBe(0);
    expect(createCrawledSession).toHaveBeenCalledTimes(1);
  });

  it('skips a post with no start time, so no fabricated "starts now" is published', async () => {
    const result = await ingest(extraction({ startTime: undefined }));

    expect(result.imported).toBe(0);
    expect(result.skippedIncomplete).toBe(1);
    expect(createCrawledSession).not.toHaveBeenCalled();
  });

  it('skips a post with no location at all', async () => {
    const result = await ingest(
      extraction({ venue: undefined, location: undefined })
    );

    expect(result.imported).toBe(0);
    expect(result.skippedIncomplete).toBe(1);
    expect(createCrawledSession).not.toHaveBeenCalled();
  });

  it('accepts a free-form location with no structured venue', async () => {
    const result = await ingest(
      extraction({ venue: undefined, location: 'Nhà thi đấu Phú Thọ' })
    );

    expect(result.imported).toBe(1);
    expect(result.skippedIncomplete).toBe(0);
  });

  it('accepts a venue known only by address', async () => {
    const result = await ingest(
      extraction({ venue: { address: '123 Nguyễn Văn Linh' } })
    );

    expect(result.imported).toBe(1);
  });

  it('counts a post missing both fields once, not twice', async () => {
    const result = await ingest(
      extraction({ startTime: undefined, venue: undefined })
    );

    expect(result.skippedIncomplete).toBe(1);
    expect(result.received).toBe(1);
  });

  it('rejects a non-recruitment post before the completeness gate runs', async () => {
    const result = await ingest(
      extraction({
        isRecruitmentPost: false,
        nonRecruitmentReason: 'class ad',
        startTime: undefined,
        venue: undefined,
      })
    );

    expect(result.skippedNonRecruitment).toBe(1);
    expect(result.skippedIncomplete).toBe(0);
  });

  it('keeps missing-content noise separate from incompleteness', async () => {
    const result = await service.ingestApifyPosts({
      items: [{ postUrl: 'https://facebook.com/p/1', text: '   ' }],
    } as never);

    expect(result.skippedNoise).toBe(1);
    expect(result.skippedIncomplete).toBe(0);
    expect(extractSessionFromArticle).not.toHaveBeenCalled();
  });
});
