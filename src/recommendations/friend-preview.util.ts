/**
 * "{n} người quen …" on the app's feed suggestion cards: a few of the
 * viewer's "friends" (players who shared 2+ sessions with them, see
 * UserRecommendationContext.friendIds) attached to a recommended item.
 */
export const FRIEND_PREVIEW_SIZE = 3;

export interface FriendPreviewUser {
  id: string;
  name: string | null;
  image: string | null;
}

export interface FriendPreview {
  /** Every friend on the item, not just [users]; matches the scorer's count. */
  count: number;
  users: FriendPreviewUser[];
}

/** Ids of items the scorer counted friends on — the only ones worth a query. */
export function idsWithFriends(
  ids: string[],
  counts: Map<string, number>
): string[] {
  return ids.filter((id) => (counts.get(id) ?? 0) > 0);
}

/**
 * Groups friend rows (newest first) into at most [FRIEND_PREVIEW_SIZE]
 * users per item. Rows without a user (guest players) are skipped.
 */
export function buildFriendPreviews(
  rows: { itemId: string; user: FriendPreviewUser | null }[],
  counts: Map<string, number>
): Map<string, FriendPreview> {
  const previews = new Map<string, FriendPreview>();
  for (const row of rows) {
    if (!row.user) continue;
    const entry = previews.get(row.itemId) ?? {
      count: counts.get(row.itemId) ?? 0,
      users: [],
    };
    if (
      entry.users.length < FRIEND_PREVIEW_SIZE &&
      !entry.users.some((user) => user.id === row.user!.id)
    ) {
      entry.users.push(row.user);
    }
    previews.set(row.itemId, entry);
  }
  return previews;
}
