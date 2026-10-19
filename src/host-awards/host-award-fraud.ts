import { DAY_MS, FRAUD } from './host-awards.constants';
import { SessionVerdict } from './host-qualification';
import {
  AwardFlag,
  AwardRating,
  FraudResult,
  MonthDataset,
} from './host-awards.types';

export interface DeviceSharing {
  excludedUserIds: Set<string>;
  sharedWithHost: number;
  sharedBetweenPlayers: number;
}

/**
 * Accounts that share a device with the host, or with another player of the
 * host, are treated as sock puppets and never count for that host.
 */
export function detectDeviceSharing(
  hostId: string,
  playerUserIds: Iterable<string>,
  deviceIdsByUser: Map<string, string[]>
): DeviceSharing {
  const usersByDevice = new Map<string, Set<string>>();
  for (const userId of new Set([hostId, ...playerUserIds])) {
    for (const deviceId of deviceIdsByUser.get(userId) ?? []) {
      const users = usersByDevice.get(deviceId) ?? new Set<string>();
      users.add(userId);
      usersByDevice.set(deviceId, users);
    }
  }

  const withHost = new Set<string>();
  const betweenPlayers = new Set<string>();
  for (const users of usersByDevice.values()) {
    if (users.size < 2) continue;
    const target = users.has(hostId) ? withHost : betweenPlayers;
    for (const userId of users) if (userId !== hostId) target.add(userId);
  }
  for (const userId of withHost) betweenPlayers.delete(userId);

  return {
    excludedUserIds: new Set([...withHost, ...betweenPlayers]),
    sharedWithHost: withHost.size,
    sharedBetweenPlayers: betweenPlayers.size,
  };
}

/** Player→host 5★ ratings answered by host→player 5★ in the same session. */
export function reciprocalRatingIds(
  hostRatings: AwardRating[],
  allRatings: AwardRating[],
  hostId: string
): Set<string> {
  const hostGaveFive = new Set(
    allRatings
      .filter(
        (r) =>
          r.type === 'HOST_TO_PLAYER' &&
          r.raterUserId === hostId &&
          r.rating === 5
      )
      .map((r) => `${r.sessionId}:${r.ratedUserId}`)
  );
  const byRater = new Map<string, string[]>();
  for (const rating of hostRatings) {
    if (rating.rating !== 5) continue;
    if (!hostGaveFive.has(`${rating.sessionId}:${rating.raterUserId}`)) {
      continue;
    }
    const ids = byRater.get(rating.raterUserId) ?? [];
    ids.push(rating.id);
    byRater.set(rating.raterUserId, ids);
  }
  const ignored = new Set<string>();
  for (const ids of byRater.values()) {
    if (ids.length >= FRAUD.reciprocalFiveStarMinCount) {
      ids.forEach((id) => ignored.add(id));
    }
  }
  return ignored;
}

export interface FraudInput {
  hostId: string;
  counted: SessionVerdict[];
  hostRatings: AwardRating[];
  deviceSharing: DeviceSharing;
  medianMatchMinutes: number | null;
  dataset: MonthDataset;
}

export function assessHost(input: FraudInput): FraudResult {
  const { hostId, dataset, deviceSharing } = input;
  const flags: AwardFlag[] = [];
  let penalty = 0;

  if (deviceSharing.sharedWithHost > 0) {
    flags.push({
      code: 'DEVICE_SHARED_WITH_HOST',
      severity: 'red',
      detail: `${deviceSharing.sharedWithHost} account(s) share a device with the host`,
    });
  }
  if (deviceSharing.sharedBetweenPlayers > 0) {
    flags.push({
      code: 'DEVICE_SHARED_BETWEEN_PLAYERS',
      severity: 'yellow',
      detail: `${deviceSharing.sharedBetweenPlayers} player account(s) share devices`,
    });
  }

  const players = [...new Set(input.counted.flatMap((v) => v.verifiedUserIds))];
  const ratio = (n: number) => (players.length ? n / players.length : 0);

  const loyalOnly = players.filter((userId) =>
    (dataset.participationByUser.get(userId) ?? []).every(
      (row) => row.hostId === hostId
    )
  ).length;
  // With few accounts (guests are most players) a ratio says little.
  const enoughAccounts = players.length >= FRAUD.minAccountsForRatioFlags;
  const closedCluster =
    enoughAccounts && ratio(loyalOnly) > FRAUD.closedClusterRatio;

  const newCutoff = dataset.end.getTime() - FRAUD.newAccountDays * DAY_MS;
  const newAccounts = players.filter(
    (userId) =>
      (dataset.users.get(userId)?.createdAt.getTime() ?? 0) >= newCutoff
  ).length;
  const newAccountBurst =
    enoughAccounts && ratio(newAccounts) > FRAUD.newAccountRatio;

  if (closedCluster) {
    penalty += FRAUD.closedClusterPenalty;
    flags.push({
      code: 'CLOSED_CLUSTER',
      // A loyal community alone is fine; loyal *and* freshly created is not.
      severity: newAccountBurst ? 'red' : 'yellow',
      detail: `${loyalOnly}/${players.length} players never played with another host`,
    });
  }
  if (newAccountBurst) {
    penalty += FRAUD.newAccountPenalty;
    flags.push({
      code: 'NEW_ACCOUNT_BURST',
      severity: 'yellow',
      detail: `${newAccounts}/${players.length} players created their account within ${FRAUD.newAccountDays} days`,
    });
  }

  const ignoredRatingIds = reciprocalRatingIds(
    input.hostRatings,
    dataset.ratings,
    hostId
  );
  if (ignoredRatingIds.size > 0) {
    flags.push({
      code: 'RECIPROCAL_RATINGS',
      severity: 'yellow',
      detail: `${ignoredRatingIds.size} reciprocal 5★ rating(s) ignored`,
    });
  }

  const ratings = input.hostRatings.filter((r) => !ignoredRatingIds.has(r.id));
  const ignoreAllRatings = suspiciousRatings(ratings, dataset, flags);

  if (
    input.medianMatchMinutes !== null &&
    input.medianMatchMinutes < FRAUD.ghostMatchMedianMinutes
  ) {
    flags.push({
      code: 'SHORT_MATCHES',
      severity: 'yellow',
      detail: `Median match length ${input.medianMatchMinutes.toFixed(1)} min`,
    });
  }

  const playerSet = new Set(players);
  const blocks = dataset.blocks.filter(
    (b) => b.blockedId === hostId && playerSet.has(b.blockerId)
  ).length;
  if (blocks >= FRAUD.blockedByPlayersMin) {
    flags.push({
      code: 'BLOCKED_BY_PLAYERS',
      severity: 'yellow',
      detail: `Blocked by ${blocks} of their own players`,
    });
  }

  return {
    flags,
    trustFactor: Math.max(FRAUD.minTrustFactor, 1 - penalty),
    ignoredRatingIds,
    ignoreAllRatings,
  };
}

/** Flags rating patterns typical of bought or self-made reviews. */
function suspiciousRatings(
  ratings: AwardRating[],
  dataset: MonthDataset,
  flags: AwardFlag[]
): boolean {
  if (ratings.length === 0) return false;

  const freshFiveStars = ratings.filter((r) => {
    const rater = dataset.users.get(r.raterUserId);
    const ageDays = rater
      ? (r.createdAt.getTime() - rater.createdAt.getTime()) / DAY_MS
      : 0;
    return r.rating === 5 && ageDays < FRAUD.newAccountDays;
  }).length;
  if (
    freshFiveStars / ratings.length >= FRAUD.ratingNewAccountFiveStarRatio &&
    ratings.length >= 5
  ) {
    flags.push({
      code: 'RATINGS_FROM_NEW_ACCOUNTS',
      severity: 'yellow',
      detail: `${freshFiveStars}/${ratings.length} ratings are 5★ from new accounts; ratings ignored`,
    });
    return true;
  }

  const allSame = ratings.every((r) => r.rating === ratings[0].rating);
  if (allSame && ratings.length >= FRAUD.ratingZeroVarianceMinCount) {
    // Informational: a great host can legitimately get only 5★.
    flags.push({
      code: 'UNIFORM_RATINGS',
      severity: 'yellow',
      detail: `All ${ratings.length} ratings are ${ratings[0].rating}★`,
    });
  }
  return false;
}
