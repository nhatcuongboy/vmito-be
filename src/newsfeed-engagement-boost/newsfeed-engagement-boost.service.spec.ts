import { NewsfeedEngagementBoostService } from './newsfeed-engagement-boost.service';

describe('NewsfeedEngagementBoostService', () => {
  const featureFlags = { isEnabled: jest.fn() };
  const prisma = {
    postEngagementBoost: {
      fields: { targetCount: 'targetCount' },
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    postLike: { count: jest.fn() },
  };
  const sessionsGateway = { notifyPostLikeUpdate: jest.fn() };

  let service: NewsfeedEngagementBoostService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NewsfeedEngagementBoostService(
      prisma as never,
      featureFlags as never,
      sessionsGateway as never
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not create a schedule while the flag is disabled', async () => {
    featureFlags.isEnabled.mockResolvedValue(false);

    await expect(service.buildCreateData()).resolves.toBeUndefined();
  });

  it('fails closed when the flag lookup fails', async () => {
    featureFlags.isEnabled.mockRejectedValue(new Error('database unavailable'));

    await expect(service.buildCreateData()).resolves.toBeUndefined();
  });

  it('creates a low-weighted schedule inside the configured time bounds', async () => {
    featureFlags.isEnabled.mockResolvedValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const now = new Date('2026-08-24T00:00:00.000Z');

    const schedule = await service.buildCreateData(now);

    expect(schedule).toEqual({
      targetCount: 1,
      currentCount: 0,
      nextLikeAt: new Date('2026-08-24T00:02:00.000Z'),
      endsAt: new Date('2026-08-24T00:30:00.000Z'),
    });
  });

  it('can select the maximum target without exceeding nine likes', async () => {
    featureFlags.isEnabled.mockResolvedValue(true);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const schedule = await service.buildCreateData(
      new Date('2026-08-24T00:00:00.000Z')
    );

    expect(schedule?.targetCount).toBe(9);
  });

  it('pauses due schedules while the flag is disabled', async () => {
    featureFlags.isEnabled.mockResolvedValue(false);

    await expect(service.processDueBoosts()).resolves.toBe(0);
    expect(prisma.postEngagementBoost.findMany).not.toHaveBeenCalled();
  });

  it('claims one due boost and emits the aggregate displayed count', async () => {
    const now = new Date('2026-08-24T00:10:00.000Z');
    const nextLikeAt = new Date('2026-08-24T00:09:00.000Z');
    featureFlags.isEnabled.mockResolvedValue(true);
    prisma.postEngagementBoost.findMany.mockResolvedValue([
      {
        postId: 'post-1',
        targetCount: 3,
        currentCount: 0,
        nextLikeAt,
        endsAt: new Date('2026-08-24T01:00:00.000Z'),
      },
    ]);
    prisma.postEngagementBoost.updateMany.mockResolvedValue({ count: 1 });
    prisma.postEngagementBoost.findUnique.mockResolvedValue({
      currentCount: 1,
    });
    prisma.postLike.count.mockResolvedValue(2);
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    await expect(service.processDueBoosts(now)).resolves.toBe(1);

    expect(prisma.postEngagementBoost.updateMany).toHaveBeenCalledTimes(1);
    expect(sessionsGateway.notifyPostLikeUpdate).toHaveBeenCalledWith(
      'post-1',
      {
        actorId: null,
        isLiked: false,
        likeCount: 3,
        source: 'engagement_boost',
      }
    );
  });

  it('does not emit when another instance already claimed the boost', async () => {
    featureFlags.isEnabled.mockResolvedValue(true);
    prisma.postEngagementBoost.findMany.mockResolvedValue([
      {
        postId: 'post-1',
        targetCount: 2,
        currentCount: 0,
        nextLikeAt: new Date('2026-08-24T00:09:00.000Z'),
        endsAt: new Date('2026-08-24T01:00:00.000Z'),
      },
    ]);
    prisma.postEngagementBoost.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.processDueBoosts(new Date('2026-08-24T00:10:00.000Z'))
    ).resolves.toBe(0);
    expect(sessionsGateway.notifyPostLikeUpdate).not.toHaveBeenCalled();
  });
});
