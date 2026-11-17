import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaveVenueReviewDto } from './save-venue-review.dto';

const check = (plain: object) =>
  validate(plainToInstance(SaveVenueReviewDto, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('SaveVenueReviewDto', () => {
  it.each([0, 6, 2.5, '3'])('rejects rating %p', async (rating) => {
    expect(await check({ rating })).not.toHaveLength(0);
  });

  it('accepts 1-5 and an omitted comment', async () => {
    expect(await check({ rating: 1 })).toHaveLength(0);
    expect(await check({ rating: 5 })).toHaveLength(0);
  });

  it('trims the comment and treats blank as empty', () => {
    expect(
      plainToInstance(SaveVenueReviewDto, { rating: 5, comment: '  hi  ' })
        .comment
    ).toBe('hi');
    expect(
      plainToInstance(SaveVenueReviewDto, { rating: 5, comment: '   ' }).comment
    ).toBeUndefined();
  });

  it('caps the comment at 500 characters after trimming', async () => {
    expect(
      await check({ rating: 5, comment: ` ${'a'.repeat(500)} ` })
    ).toHaveLength(0);
    expect(
      await check({ rating: 5, comment: 'a'.repeat(501) })
    ).not.toHaveLength(0);
  });
});
