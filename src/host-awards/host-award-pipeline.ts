import { RATING } from './host-awards.constants';
import { assessHost, detectDeviceSharing } from './host-award-fraud';
import {
  checkEligibility,
  computeHostMetrics,
  countedMatchMinutes,
  EligibilityCheck,
  eligibleHostRatings,
  median,
} from './host-award-metrics';
import { scoreHosts } from './host-award-scoring';
import {
  applySessionCaps,
  qualifySession,
  SessionVerdict,
} from './host-qualification';
import {
  AwardFlag,
  AwardRating,
  AwardSession,
  HostMetrics,
  MonthDataset,
  ScoredHost,
} from './host-awards.types';

export interface HostEvaluation {
  hostId: string;
  metrics: HostMetrics;
  eligibility: EligibilityCheck;
  flags: AwardFlag[];
  trustFactor: number;
  /** Why non-qualifying sessions were rejected, e.g. { TOO_SHORT: 2 }. */
  rejections: Record<string, number>;
}

export interface MonthEvaluation {
  hosts: HostEvaluation[];
  /** Eligible hosts only, best first. */
  scored: ScoredHost[];
  globalRatingMean: number;
}

interface HostDraft {
  hostId: string;
  sessions: AwardSession[];
  verdicts: SessionVerdict[];
  counted: SessionVerdict[];
  ratings: AwardRating[];
  fraud: ReturnType<typeof assessHost>;
}

/**
 * Pure month evaluation: qualify sessions, detect fraud, compute metrics and
 * score eligible hosts. Same input → same output, so recomputes are safe.
 */
export function evaluateMonth(
  dataset: MonthDataset,
  options: { includeHostIds?: string[] } = {}
): MonthEvaluation {
  const sessionsByHost = new Map<string, AwardSession[]>(
    (options.includeHostIds ?? []).map((hostId) => [hostId, []])
  );
  for (const session of dataset.sessions) {
    const list = sessionsByHost.get(session.hostId) ?? [];
    list.push(session);
    sessionsByHost.set(session.hostId, list);
  }
  for (const hostId of dataset.cancelledByHost.keys()) {
    if (!sessionsByHost.has(hostId)) sessionsByHost.set(hostId, []);
  }

  const drafts = [...sessionsByHost].map(([hostId, sessions]) =>
    draftHost(hostId, sessions, dataset)
  );

  const countable = drafts.flatMap((d) =>
    d.fraud.ignoreAllRatings
      ? []
      : d.ratings.filter((r) => !d.fraud.ignoredRatingIds.has(r.id))
  );
  const globalRatingMean = countable.length
    ? countable.reduce((sum, r) => sum + r.rating, 0) / countable.length
    : RATING.fallbackMean;

  const hosts = drafts.map((draft): HostEvaluation => {
    const metrics = computeHostMetrics({
      hostId: draft.hostId,
      sessions: draft.sessions,
      verdicts: draft.verdicts,
      counted: draft.counted,
      ratings: draft.ratings.filter(
        (r) => !draft.fraud.ignoredRatingIds.has(r.id)
      ),
      globalRatingMean,
      ignoreAllRatings: draft.fraud.ignoreAllRatings,
      dataset,
    });
    const rejections: Record<string, number> = {};
    for (const verdict of draft.verdicts) {
      if (verdict.rejection) {
        rejections[verdict.rejection] =
          (rejections[verdict.rejection] ?? 0) + 1;
      }
    }
    return {
      hostId: draft.hostId,
      metrics,
      eligibility: checkEligibility(
        metrics,
        dataset.sanctionedHostIds.has(draft.hostId)
      ),
      flags: draft.fraud.flags,
      trustFactor: draft.fraud.trustFactor,
      rejections,
    };
  });

  const eligible = hosts.filter((h) => h.eligibility.eligible);
  const scored = scoreHosts(
    eligible.map((h) => h.metrics),
    new Map(eligible.map((h) => [h.hostId, h.trustFactor]))
  );
  return { hosts, scored, globalRatingMean };
}

function draftHost(
  hostId: string,
  sessions: AwardSession[],
  dataset: MonthDataset
): HostDraft {
  const playerUserIds = sessions.flatMap((s) =>
    s.players.map((p) => p.userId).filter((id): id is string => !!id)
  );
  const deviceSharing = detectDeviceSharing(
    hostId,
    playerUserIds,
    dataset.deviceIdsByUser
  );

  const verdicts = sessions
    .map((s) => qualifySession(s, dataset.users, deviceSharing.excludedUserIds))
    .filter((v): v is SessionVerdict => v !== null);
  const counted = applySessionCaps(verdicts);
  const ratings = eligibleHostRatings(dataset.ratings, hostId, counted);

  const fraud = assessHost({
    hostId,
    counted,
    hostRatings: ratings,
    deviceSharing,
    medianMatchMinutes: median(countedMatchMinutes(sessions, counted)),
    dataset,
  });
  return { hostId, sessions, verdicts, counted, ratings, fraud };
}
