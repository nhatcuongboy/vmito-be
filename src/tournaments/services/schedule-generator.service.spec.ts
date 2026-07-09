import { ScheduleGeneratorService } from './schedule-generator.service';

describe('ScheduleGeneratorService', () => {
  it('does not auto-generate matches and returns MATCHES_NOT_GENERATED when no scheduled matches exist', async () => {
    const prisma = {
      tournament: {
        findUnique: jest.fn().mockResolvedValue({ hostId: 'user-1' }),
      },
      categoryMatch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const validationService = { throwIfInvalid: jest.fn() };
    const algorithmService = { generate: jest.fn() };
    const service = new ScheduleGeneratorService(
      prisma as never,
      validationService as never,
      algorithmService as never
    );

    await expect(
      service.generate('tournament-1', {} as never, 'user-1')
    ).rejects.toMatchObject({
      response: {
        code: 'MATCHES_NOT_GENERATED',
        message: 'Generate matches before creating a schedule',
      },
    });
    expect(validationService.throwIfInvalid).not.toHaveBeenCalled();
    expect(algorithmService.generate).not.toHaveBeenCalled();
  });
});
