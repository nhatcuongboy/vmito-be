import { RankedResultStatus } from '@prisma/client';

/**
 * Why the viewer has no ranked points from a match, for the "my ranked
 * matches" page. `ORGANIZER` wins over everything: the match may still count
 * for the other players, but the host/co-host never earns from their own
 * session (and has no ledger row to show).
 */
/** `ORGANIZER`, an `IneligibleReason`, or null when the viewer earned points. */
export type MyExclusion = string | null;

export function myExclusion(input: {
  isOrganizer: boolean;
  status: RankedResultStatus | null;
  ineligibleReason: string | null;
}): MyExclusion {
  if (input.isOrganizer) return 'ORGANIZER';
  if (input.status === 'INELIGIBLE') return input.ineligibleReason;
  return null;
}

export function sessionOrganizerIds(session: {
  hostId: string | null;
  managers: { userId: string }[];
}): Set<string> {
  return new Set([
    ...(session.hostId ? [session.hostId] : []),
    ...session.managers.map((m) => m.userId),
  ]);
}
