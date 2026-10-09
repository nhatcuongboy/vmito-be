import { ActivityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildClubJoinMetadata,
  buildClubMetadata,
} from './utils/club-activity-metadata.util';

interface HydratablePost {
  activityType?: ActivityType | null;
  metadata?: Prisma.JsonValue;
}

const CLUB_ACTIVITY_TYPES = new Set<ActivityType>([
  ActivityType.CLUB_CREATED,
  ActivityType.CLUB_UPDATED,
  ActivityType.CLUB_MEMBER_JOINED,
  ActivityType.CLUB_AVATAR_UPDATED,
  ActivityType.CLUB_COVER_PHOTO_UPDATED,
]);

const clubSelect = {
  id: true,
  slug: true,
  name: true,
  logo: true,
  isPublic: true,
  description: true,
  joinPolicy: true,
  requiredLevels: true,
  schedules: {
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      isActive: true,
    },
  },
  defaultVenue: {
    select: { name: true, address: true, numberOfCourts: true },
  },
} satisfies Prisma.ClubSelect;

type HydrationClub = Prisma.ClubGetPayload<{ select: typeof clubSelect }>;

function snapshotOf(post: HydratablePost): Prisma.JsonObject | null {
  const { metadata } = post;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata
    : null;
}

function clubIdOf(post: HydratablePost): string | null {
  if (!post.activityType || !CLUB_ACTIVITY_TYPES.has(post.activityType)) {
    return null;
  }
  const clubId = snapshotOf(post)?.clubId;
  return typeof clubId === 'string' ? clubId : null;
}

/**
 * What a post shows of the club, by activity type. Created / updated posts are
 * an invitation to join, so they show the club as it is now. Media posts keep
 * their own snapshot of the image that changed (the image *is* the post), and
 * "member joined" posts never carried the join details, so they only refresh
 * the club's name and link.
 */
function hydratedMetadata(
  activityType: ActivityType,
  snapshot: Prisma.JsonObject,
  club: HydrationClub
): Prisma.JsonObject {
  const fresh = {
    ...snapshot,
    clubSlug: club.slug ?? null,
    clubName: club.name,
  };

  if (
    activityType === ActivityType.CLUB_AVATAR_UPDATED ||
    activityType === ActivityType.CLUB_COVER_PHOTO_UPDATED
  ) {
    return fresh;
  }
  if (activityType === ActivityType.CLUB_MEMBER_JOINED) {
    return { ...fresh, logo: club.logo ?? null };
  }
  return {
    ...fresh,
    ...buildClubMetadata(club),
    ...buildClubJoinMetadata(club),
  } as unknown as Prisma.JsonObject;
}

/**
 * Brings club activity posts up to date at read time and drops the ones whose
 * club is gone or no longer public.
 *
 * `Post.metadata` is a snapshot taken when the post was created, so an older
 * "club updated" post would keep advertising a schedule or join policy the
 * club has since changed — and keep advertising a club that has gone private
 * or been deleted. One batched query covers the whole page.
 *
 * Non-club posts pass through untouched.
 */
export async function hydrateClubActivityPosts<T extends HydratablePost>(
  prisma: PrismaService,
  posts: T[]
): Promise<T[]> {
  const clubIds = [
    ...new Set(posts.map(clubIdOf).filter((id): id is string => id !== null)),
  ];
  if (clubIds.length === 0) return posts;

  const clubs = await prisma.club.findMany({
    where: { id: { in: clubIds } },
    select: clubSelect,
  });
  const clubsById = new Map(clubs.map((club) => [club.id, club]));

  return posts.flatMap((post) => {
    const clubId = clubIdOf(post);
    if (clubId === null) return [post];

    const club = clubsById.get(clubId);
    const snapshot = snapshotOf(post);
    if (!club || !club.isPublic || !snapshot || !post.activityType) return [];

    return [
      {
        ...post,
        metadata: hydratedMetadata(post.activityType, snapshot, club),
      },
    ];
  });
}
