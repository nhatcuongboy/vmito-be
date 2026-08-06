import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddressMappingService } from './address-mapping.service';
import { buildVenueSearchTerms } from './venue-search-terms.util';

export interface MigrateAddressesOptions {
  /**
   * Re-derive every venue instead of only untouched rows (`newAddress` null).
   * Needed after the mapping logic or the CSV itself changes, since already
   * migrated rows carry a (possibly wrong) `newAddress` and are skipped
   * otherwise.
   */
  rescan?: boolean;
  /** Compute and report, but write nothing. */
  dryRun?: boolean;
}

export interface MigrateAddressesResult {
  message: string;
  dryRun: boolean;
  rescan: boolean;
  /** Venues examined in this run. */
  total: number;
  /** Ward identified in the CSV — full `newAddress` + `newDistrict` + `newCity`. */
  matched: number;
  /** Only the province could be resolved (ward unknown, province changed). */
  cityOnly: number;
  /**
   * A ward was identified, so `streetAddress`/`wardOld` were persisted, but
   * the province did not change and no new-era address was produced.
   */
  streetOnly: number;
  /**
   * Nothing at all resolved AND the ward could not be identified — the address
   * needs a human. These rows are left completely untouched.
   */
  needsReview: number;
  /** Sample of the venues counted in `needsReview`, for the admin UI. */
  needsReviewSamples: {
    id: string;
    name: string;
    address: string;
    district: string;
    city: string;
  }[];
}

/** How many unmatched venues to echo back to the caller. */
const NEEDS_REVIEW_SAMPLE_LIMIT = 25;

/**
 * Resolves new-era (Nghị quyết 60) address fields for venues from the CSV
 * mapping loaded by {@link AddressMappingService}.
 *
 * Split out of VenuesService: address migration is a self-contained admin
 * batch job with its own failure modes, and VenuesService is already well past
 * the size where another concern belongs in it.
 */
@Injectable()
export class VenueAddressMigrationService {
  private readonly logger = new Logger(VenueAddressMigrationService.name);

  constructor(
    private prisma: PrismaService,
    private addressMapping: AddressMappingService
  ) {}

  async migrateAddresses(
    options?: MigrateAddressesOptions
  ): Promise<MigrateAddressesResult> {
    const rescan = options?.rescan ?? false;
    const dryRun = options?.dryRun ?? false;

    const venues = await this.prisma.venue.findMany({
      where: rescan ? {} : { newAddress: null },
      select: {
        id: true,
        address: true,
        district: true,
        city: true,
        name: true,
        sportType: true,
        sportTypes: true,
      },
    });

    let matched = 0;
    let cityOnly = 0;
    let streetOnly = 0;
    let needsReview = 0;
    const needsReviewSamples: MigrateAddressesResult['needsReviewSamples'] = [];

    for (const venue of venues) {
      const address = venue.address || '';
      const district = venue.district || '';
      const city = venue.city || '';

      const { streetAddress, wardOld } =
        this.addressMapping.extractStreetAndWard(address, district, city);
      // Always hand resolve() the street this run just derived rather than the
      // persisted Venue.streetAddress: on a rescan the stored value may predate
      // a mapping fix and would silently survive into the new newAddress.
      const resolved = this.addressMapping.resolve(
        address,
        district,
        city,
        streetAddress
      );

      const updateData: Record<string, string | undefined> = {};

      // `extractStreetAndWard` falls back to "the whole address is the street"
      // when it cannot identify a ward. Persisting that would bake the stale
      // district/city text into streetAddress — and from there into every
      // future newAddress — so only write when a ward was actually found.
      if (wardOld) {
        updateData.streetAddress = streetAddress;
        updateData.wardOld = wardOld;
      }

      if (resolved?.newAddress) {
        updateData.newAddress = resolved.newAddress;
        updateData.newDistrict = resolved.newDistrict;
        matched++;
      }

      if (resolved?.newCity) {
        updateData.newCity = resolved.newCity;
        if (!resolved.newAddress) cityOnly++;
      }

      if (Object.keys(updateData).length === 0) {
        needsReview++;
        if (needsReviewSamples.length < NEEDS_REVIEW_SAMPLE_LIMIT) {
          needsReviewSamples.push({
            id: venue.id,
            name: venue.name,
            address,
            district,
            city,
          });
        }
        continue;
      }

      if (!resolved?.newAddress && !resolved?.newCity) streetOnly++;

      if (updateData.newAddress || updateData.newCity) {
        updateData.searchTerms = buildVenueSearchTerms({
          name: venue.name,
          sportType: venue.sportType,
          sportTypes: venue.sportTypes,
          address: venue.address,
          district: venue.district,
          city: venue.city,
          newAddress: resolved?.newAddress,
          newDistrict: resolved?.newDistrict,
          newCity: resolved?.newCity,
        });
      }

      if (!dryRun) {
        await this.prisma.venue.update({
          where: { id: venue.id },
          data: updateData,
        });
      }
    }

    this.logger.log(
      `migrateAddresses(rescan=${rescan}, dryRun=${dryRun}): ${venues.length} scanned, ` +
        `${matched} matched, ${cityOnly} city-only, ${streetOnly} street-only, ${needsReview} need review`
    );

    return {
      message: dryRun
        ? 'Dry run complete — no changes were written'
        : 'Address migration complete',
      dryRun,
      rescan,
      total: venues.length,
      matched,
      cityOnly,
      streetOnly,
      needsReview,
      needsReviewSamples,
    };
  }
}
