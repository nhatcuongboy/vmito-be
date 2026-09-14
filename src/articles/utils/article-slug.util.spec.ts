import { buildUniqueSlug, slugifyTitle } from './article-slug.util';

describe('slugifyTitle', () => {
  it('transliterates Vietnamese diacritics instead of stripping them', () => {
    expect(slugifyTitle('Giải đấu cầu lông mùa hè')).toBe(
      'giai-dau-cau-long-mua-he'
    );
  });

  it('collapses punctuation and trims leading/trailing hyphens', () => {
    expect(slugifyTitle('  Top 5 vợt cầu lông (2026)!  ')).toBe(
      'top-5-vot-cau-long-2026'
    );
  });

  it('returns an empty string for titles with no ASCII form', () => {
    expect(slugifyTitle('羽毛球比赛')).toBe('');
  });
});

describe('buildUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await buildUniqueSlug('Cầu lông', () =>
      Promise.resolve(false)
    );
    expect(slug).toBe('cau-long');
  });

  it('suffixes until it finds a free slug', async () => {
    const taken = new Set(['cau-long', 'cau-long-2']);
    const slug = await buildUniqueSlug('Cầu lông', (candidate) =>
      Promise.resolve(taken.has(candidate))
    );
    expect(slug).toBe('cau-long-3');
  });

  it('falls back to a generated slug when the title has no ASCII form', async () => {
    const slug = await buildUniqueSlug('羽毛球比赛', () =>
      Promise.resolve(false)
    );
    expect(slug).toMatch(/^article-[a-z0-9]+$/);
  });
});
