import { ActivityType, Prisma } from '@prisma/client';
import { hydrateClubActivityPosts } from './club-activity-hydrator';

describe('hydrateClubActivityPosts', () => {
  const prisma = { club: { findMany: jest.fn() } };

  const club = (overrides: Record<string, unknown> = {}) => ({
    id: 'club-1',
    slug: 'new-slug',
    name: 'New name',
    logo: 'new-logo.png',
    isPublic: true,
    description: '<p>Fresh description</p>',
    joinPolicy: 'INVITATION_ONLY',
    requiredLevels: [3],
    schedules: [
      { dayOfWeek: 1, startTime: '19:00', endTime: '21:00', isActive: true },
      { dayOfWeek: 2, startTime: '18:00', endTime: '20:00', isActive: false },
    ],
    defaultVenue: { name: 'New venue', address: 'Addr', numberOfCourts: 4 },
    ...overrides,
  });

  const post = (
    activityType: ActivityType | null,
    metadata: Prisma.JsonValue
  ) => ({
    id: `post-${String(activityType)}`,
    activityType,
    metadata,
  });

  const staleMetadata = {
    clubId: 'club-1',
    clubSlug: 'old-slug',
    clubName: 'Old name',
    logo: 'old-logo.png',
    venueName: 'Old venue',
    schedules: [],
    joinPolicy: 'OPEN',
    requiredLevels: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.club.findMany.mockResolvedValue([club()]);
  });

  it('refreshes created / updated posts with the current club info', async () => {
    const [result] = await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_UPDATED, staleMetadata),
    ]);

    expect(result.metadata).toMatchObject({
      clubId: 'club-1',
      clubSlug: 'new-slug',
      clubName: 'New name',
      logo: 'new-logo.png',
      venueName: 'New venue',
      description: 'Fresh description',
      joinPolicy: 'INVITATION_ONLY',
      requiredLevels: [3],
      schedules: [{ dayOfWeek: 1, startTime: '19:00', endTime: '21:00' }],
    });
  });

  it('keeps the changed image on media posts but refreshes name and slug', async () => {
    const [result] = await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_AVATAR_UPDATED, {
        ...staleMetadata,
        logo: 'avatar-at-that-time.png',
      }),
    ]);

    expect(result.metadata).toMatchObject({
      clubSlug: 'new-slug',
      clubName: 'New name',
      logo: 'avatar-at-that-time.png',
      venueName: 'Old venue',
      joinPolicy: 'OPEN',
    });
  });

  it('does not add join details to member-joined posts', async () => {
    const [result] = await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_MEMBER_JOINED, {
        clubId: 'club-1',
        clubSlug: 'old-slug',
        clubName: 'Old name',
        logo: 'old-logo.png',
      }),
    ]);

    expect(result.metadata).toEqual({
      clubId: 'club-1',
      clubSlug: 'new-slug',
      clubName: 'New name',
      logo: 'new-logo.png',
    });
  });

  it('drops club posts whose club is private or deleted', async () => {
    prisma.club.findMany.mockResolvedValue([club({ isPublic: false })]);

    const privateResult = await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_UPDATED, staleMetadata),
    ]);
    expect(privateResult).toEqual([]);

    prisma.club.findMany.mockResolvedValue([]);
    const deletedResult = await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_CREATED, staleMetadata),
    ]);
    expect(deletedResult).toEqual([]);
  });

  it('passes non-club posts through and skips the query when there are none', async () => {
    const posts = [
      post(null, null),
      post(ActivityType.SESSION_CREATED, { sessionId: 's-1' }),
    ];

    await expect(
      hydrateClubActivityPosts(prisma as never, posts)
    ).resolves.toEqual(posts);
    expect(prisma.club.findMany).not.toHaveBeenCalled();
  });

  it('looks up each club once per page', async () => {
    await hydrateClubActivityPosts(prisma as never, [
      post(ActivityType.CLUB_UPDATED, staleMetadata),
      post(ActivityType.CLUB_CREATED, staleMetadata),
    ]);

    expect(prisma.club.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.club.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['club-1'] } } })
    );
  });
});
