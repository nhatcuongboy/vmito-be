import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * How an approved ownership claim treats a venue's existing owners: `ADD`
 * keeps them as co-owners, `REPLACE` demotes them to managers.
 */
export const OWNERSHIP_CLAIM_MODES = ['ADD', 'REPLACE'] as const;
export type OwnershipClaimMode = (typeof OWNERSHIP_CLAIM_MODES)[number];

export class ApproveVenueRequestDto {
  // For IMAGE_CORRECTION and CREATE requests: the subset of suggested-image
  // publicIds the admin selected to apply to the venue gallery. Omit to apply
  // all of them.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  applyImagePublicIds?: string[];

  // For OWNERSHIP_CLAIM requests. Defaults to ADD: replacing an owner must be
  // an explicit admin decision.
  @IsOptional()
  @IsIn(OWNERSHIP_CLAIM_MODES)
  ownershipMode?: OwnershipClaimMode;
}
