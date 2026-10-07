import { SportType } from '@prisma/client';
import { buildNonAiExtraction } from './non-ai-extraction.util';

describe('buildNonAiExtraction (CRAWLER_USE_AI=false path)', () => {
  it('classifies a recruitment post and extracts the regex-safe fields', () => {
    const result = buildNonAiExtraction(
      'Tuyển vãng lai cầu lông tối nay 19h-21h tại Sân ABC Quận 7. ' +
        'Liên hệ 0901 234 567'
    );

    expect(result.isRecruitmentPost).toBe(true);
    expect(result.sportType).toBe(SportType.BADMINTON);
    expect(result.hostPhone).toBe('0901234567');
    expect(result.location).toContain('Sân ABC');
    expect(result.startTime).toBeTruthy();
    // 19h in "tối nay" is already 19:00, no PM roll needed.
    expect(new Date(result.startTime as string).getUTCHours()).toBe(12); // 19:00 ICT = 12:00 UTC
  });

  it('rejects obvious non-recruitment posts with a reason', () => {
    const result = buildNonAiExtraction(
      'Cho thuê sân cầu lông giá rẻ, sân trống cả tuần. Liên hệ 0900000000'
    );

    expect(result.isRecruitmentPost).toBe(false);
    expect(result.nonRecruitmentReason).toBe('court rental listing');
  });

  it('prefers the ad signal when both ad and recruitment words appear', () => {
    const result = buildNonAiExtraction(
      'Bán vợt cầu lông, ai cần tuyển vãng lai thì ghé shop'
    );

    expect(result.isRecruitmentPost).toBe(false);
    expect(result.nonRecruitmentReason).toBe('equipment sale');
  });

  it('rolls bare afternoon hours into the evening and normalizes +84 phones', () => {
    const result = buildNonAiExtraction(
      'Giao lưu pickleball 7h30 chiều mai, sân số 3. SĐT +84 912 345 678'
    );

    expect(result.hostPhone).toBe('0912345678');
    expect(result.sportType).toBe(SportType.PICKLEBALL);
    expect(new Date(result.startTime as string).getUTCHours()).toBe(12); // 19:30 ICT
  });

  it('does not fabricate a start time when no clock time is stated', () => {
    const result = buildNonAiExtraction(
      'Tuyển vãng lai cầu lông tại Sân XYZ, mọi người ib nhé'
    );

    expect(result.isRecruitmentPost).toBe(true);
    expect(result.startTime).toBeUndefined();
    expect(result.location).toContain('Sân XYZ');
  });

  it('returns an empty (defaulted) extraction for blank content', () => {
    const result = buildNonAiExtraction('   ');

    expect(result.isRecruitmentPost).toBe(false);
    expect(result.startTime).toBeUndefined();
    expect(result.location).toBeUndefined();
    expect(result.sportType).toBeUndefined();
  });
});
