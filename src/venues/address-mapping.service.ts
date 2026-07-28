import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface AddressMapping {
  cityNameOld: string;
  districtNameOld: string;
  wardNameOld: string;
  cityNameNew: string;
  wardNameNew: string;
}

export interface ResolvedAddress {
  newAddress?: string;
  newDistrict?: string;
  newCity?: string;
}

export interface NewAdminUnit {
  city: string;
  wards: string[];
}

@Injectable()
export class AddressMappingService implements OnModuleInit {
  private static readonly CSV_FILENAME = 'admin_mapping_old_to_new_10_25.csv';
  private readonly logger = new Logger(AddressMappingService.name);
  private wardMapping = new Map<string, AddressMapping>();
  private districtMapping = new Map<
    string,
    { cityNameNew: string; districtNameOld: string }
  >();
  private newAdminUnits: NewAdminUnit[] = [];

  onModuleInit() {
    const csvPath = this.locateCsv();
    if (!csvPath) {
      this.logger.warn(
        `Address mapping CSV "${AddressMappingService.CSV_FILENAME}" not found in any known location. Auto-mapping disabled.`
      );
      return;
    }
    this.wardMapping = this.loadMappingFromCsv(csvPath);
    this.districtMapping = this.buildDistrictMapping(this.wardMapping);
    this.newAdminUnits = this.buildNewAdminUnits(this.wardMapping);
    this.logger.log(
      `Loaded ${this.wardMapping.size} ward-level address mappings from ${csvPath}`
    );
  }

  /**
   * Full canonical list of new-era Tỉnh/Thành phố -> Phường/Xã, for admin
   * forms to offer as a dropdown instead of free text. Computed once from
   * the CSV mapping already loaded in onModuleInit — not per-request.
   */
  getNewAdminUnits(): NewAdminUnit[] {
    return this.newAdminUnits;
  }

  private buildNewAdminUnits(
    wardMapping: Map<string, AddressMapping>
  ): NewAdminUnit[] {
    const byCity = new Map<string, Set<string>>();
    for (const entry of wardMapping.values()) {
      if (!byCity.has(entry.cityNameNew)) {
        byCity.set(entry.cityNameNew, new Set());
      }
      byCity.get(entry.cityNameNew)!.add(entry.wardNameNew);
    }
    return Array.from(byCity.entries())
      .map(([city, wards]) => ({
        city,
        wards: Array.from(wards).sort((a, b) => a.localeCompare(b, 'vi')),
      }))
      .sort((a, b) => a.city.localeCompare(b.city, 'vi'));
  }

  /**
   * Locate the address-mapping CSV across the environments this app runs in.
   * The compiled output lives at dist/src/venues, so a fixed relative path is
   * brittle; instead probe the known candidate locations and return the first
   * that exists.
   */
  private locateCsv(): string | null {
    const filename = AddressMappingService.CSV_FILENAME;
    const candidates = [
      // Project root when launched from there (local `node dist/src/main`
      // and Docker `WORKDIR /app`).
      path.resolve(process.cwd(), filename),
      // Two levels up from dist/src/venues → dist/ (previous behaviour).
      path.resolve(__dirname, '..', '..', filename),
      // Three levels up from dist/src/venues → project root.
      path.resolve(__dirname, '..', '..', '..', filename),
      // Alongside the compiled service (if bundled as an asset).
      path.resolve(__dirname, filename),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    return null;
  }

  /**
   * Attempt to resolve a new-era address from the old address components.
   * Returns a partial ResolvedAddress if any mapping is found, null otherwise.
   * - Ward-level match: returns newAddress, newDistrict and newCity
   * - District-level match: returns only newCity, and only if the province changed
   *
   * `streetAddress`, if the caller already has it persisted (Venue.streetAddress),
   * is used as-is for composing `newAddress` instead of re-parsing `address`.
   */
  resolve(
    address: string,
    district: string,
    city: string,
    streetAddress?: string | null
  ): ResolvedAddress | null {
    if (!this.wardMapping.size) return null;

    const distKey = this.stripAdminPrefix(district);
    const cityKey = this.stripAdminPrefix(city);

    const matched =
      distKey && cityKey ? this.matchWard(address, distKey, cityKey) : null;

    if (matched) {
      const found = matched.entry;
      const street =
        streetAddress ??
        this.extractStreetAndWard(address, district, city).streetAddress;
      const newAddress = [street, found.wardNameNew, found.cityNameNew]
        .filter(Boolean)
        .join(', ');
      return {
        newAddress,
        newDistrict: found.wardNameNew,
        // Always recorded, including when the province name did not change.
        // The column means "the city in the new era", not "the city that
        // changed" — consumers (venue search, the admin form's required
        // newCity field, findMatchingVenue's newCity scoring) read it as the
        // former, and leaving it null for unchanged provinces silently
        // starved every venue in Hà Nội / Đà Nẵng / Hồ Chí Minh.
        newCity: found.cityNameNew,
      };
    }

    // District-level fallback. Unlike the ward branch this is a *partial*
    // resolution: the ward could not be identified, so the only thing worth
    // recording is a province that actually changed. Emitting an unchanged
    // newCity here would make callers compose a newAddress out of the street
    // plus a city, silently dropping the ward.
    if (distKey && cityKey) {
      const distEntry = this.districtMapping.get(`${distKey}|${cityKey}`);
      if (distEntry) {
        const newCity =
          this.stripAdminPrefix(distEntry.cityNameNew) !== cityKey
            ? distEntry.cityNameNew
            : undefined;
        if (newCity) return { newCity };
      }
    }

    return null;
  }

  /**
   * Find the CSV entry for the ward embedded in `address`, given an already
   * normalised district/city key. Returns the entry along with the literal
   * address text that matched, so callers can also cut that text out of the
   * address without re-deriving it.
   */
  private matchWard(
    address: string,
    distKey: string,
    cityKey: string
  ): { entry: AddressMapping; matchedText: string } | null {
    const wardCandidates = this.wardCandidatesFor(address, distKey, cityKey);

    // Exact ward match: ward + district + city
    for (const candidate of wardCandidates) {
      const wardKey = this.stripAdminPrefix(candidate);
      if (!wardKey) continue;
      const entry = this.wardMapping.get(`${wardKey}|${distKey}|${cityKey}`);
      if (entry) return { entry, matchedText: candidate };
    }

    // Fuzzy fallback: ward + district match, ignore city naming variations
    const prefix = `|${distKey}|`;
    for (const candidate of wardCandidates) {
      const wardKey = this.stripAdminPrefix(candidate);
      if (!wardKey) continue;
      for (const [key, entry] of this.wardMapping.entries()) {
        if (key.startsWith(`${wardKey}${prefix}`)) {
          return { entry, matchedText: candidate };
        }
      }
    }

    return null;
  }

  /**
   * Ward candidates for an address, with the district/city segments removed.
   *
   * Ward names very often repeat their district's name ("Phường Hải Châu" in
   * "Quận Hải Châu", "Phường 3" in "Quận 3" — over a hundred such pairs in the
   * mapping). Since bare segments are probed from the end of the address, the
   * district segment is reached before the real ward and would match that
   * same-named ward, inventing a ward-level result for an address that only
   * ever stated its district.
   *
   * An explicitly prefixed "Phường/Xã ..." is exempt: it says outright that it
   * is a ward, so it stays eligible even when it matches the district name.
   */
  private wardCandidatesFor(
    address: string,
    distKey: string,
    cityKey: string
  ): string[] {
    const candidates: string[] = [];
    const prefixed = this.extractWardFromAddress(address);
    if (prefixed) candidates.push(prefixed);

    for (const segment of this.addressSegmentsFromEnd(address)) {
      if (candidates.includes(segment)) continue;
      // A segment spelled "Quận …"/"Huyện …"/"Tỉnh …" is never a ward.
      if (
        /^(?:quận|huyện|thị\s*xã|thành\s*phố|tỉnh|q|tp|h|tx)\.?\s+/i.test(
          segment
        )
      ) {
        continue;
      }
      const key = this.stripAdminPrefix(segment);
      if (!key || key === distKey || key === cityKey) continue;
      candidates.push(segment);
    }
    return candidates;
  }

  private loadMappingFromCsv(csvPath: string): Map<string, AddressMapping> {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());
    const mapping = new Map<string, AddressMapping>();

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 10) continue;

      const cityNameOld = cols[1].trim();
      const districtNameOld = cols[3].trim();
      const wardNameOld = cols[5].trim();
      const cityNameNew = cols[7].trim();
      const wardNameNew = cols[9].trim();

      const key = `${this.stripAdminPrefix(wardNameOld)}|${this.stripAdminPrefix(districtNameOld)}|${this.stripAdminPrefix(cityNameOld)}`;
      if (!mapping.has(key)) {
        mapping.set(key, {
          cityNameOld,
          districtNameOld,
          wardNameOld,
          cityNameNew,
          wardNameNew,
        });
      }
    }

    return mapping;
  }

  private buildDistrictMapping(
    wardMapping: Map<string, AddressMapping>
  ): Map<string, { cityNameNew: string; districtNameOld: string }> {
    const districtMap = new Map<
      string,
      { cityNameNew: string; districtNameOld: string }
    >();
    for (const entry of wardMapping.values()) {
      const key = `${this.stripAdminPrefix(entry.districtNameOld)}|${this.stripAdminPrefix(entry.cityNameOld)}`;
      if (!districtMap.has(key)) {
        districtMap.set(key, {
          cityNameNew: entry.cityNameNew,
          districtNameOld: entry.districtNameOld,
        });
      }
    }
    return districtMap;
  }

  /**
   * Split a free-text `address` into the street portion (house number +
   * street name — invariant across the admin reform) and the old ward. Used
   * both to compose `newAddress` and to backfill the persisted
   * `Venue.streetAddress`/`Venue.wardOld` columns.
   *
   * Two ways to identify the ward, in order:
   * 1. An explicit "Phường/Xã/Thị trấn ..." prefix — pure text, needs no context.
   * 2. When `district`/`city` are supplied, a bare comma-separated segment that
   *    the CSV confirms is a ward of that exact district+city. Real-world data
   *    very often omits the prefix ("399 Trưng Nữ Vương, Hòa Thuận Nam, Hải
   *    Châu, Đà Nẵng"), and without this the whole address was returned as the
   *    street — which then got the new ward appended to it, leaving the stale
   *    district and city embedded in the middle of `newAddress`.
   *
   * Validating the bare segment against the mapping is what makes step 2 safe:
   * a blind "last segment is the ward" fallback would misread arbitrary address
   * text, which is why it was avoided here before.
   */
  extractStreetAndWard(
    address: string,
    district?: string | null,
    city?: string | null
  ): {
    streetAddress: string;
    wardOld: string | null;
  } {
    const prefixed = this.extractWardFromAddress(address);
    if (prefixed) return this.splitAtWard(address, prefixed);

    if (district && city) {
      const distKey = this.stripAdminPrefix(district);
      const cityKey = this.stripAdminPrefix(city);
      if (distKey && cityKey) {
        const matched = this.matchWard(address, distKey, cityKey);
        if (matched) return this.splitAtWard(address, matched.matchedText);
      }
    }

    return { streetAddress: address.trim(), wardOld: null };
  }

  /** Cut `ward` and everything after it off the address, keeping the street. */
  private splitAtWard(
    address: string,
    ward: string
  ): { streetAddress: string; wardOld: string } {
    const idx = address.lastIndexOf(ward);
    if (idx < 0) return { streetAddress: address.trim(), wardOld: ward };
    const streetAddress = address.slice(0, idx).replace(/,\s*$/, '').trim();
    return { streetAddress, wardOld: ward };
  }

  private extractWardFromAddress(address: string): string | null {
    const wardPatterns = [
      /(?:,\s*)(Phường\s+[^,]+)/i,
      /(?:,\s*)(Xã\s+[^,]+)/i,
      /(?:,\s*)(Thị\s+[Tt]rấn\s+[^,]+)/i,
      // Abbreviated numbered ward, e.g. ", P.9" / ", P9" / ", P 9" — common
      // in real-world Vietnamese address data even though it's not the
      // canonical "Phường 9" form.
      /(?:,\s*)(P\.?\s?\d+)(?=\s*(?:,|$))/i,
      /^(Phường\s+[^,]+)/i,
      /^(Xã\s+[^,]+)/i,
      /^(P\.?\s?\d+)(?=\s*(?:,|$))/i,
    ];
    for (const pattern of wardPatterns) {
      const match = address.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Comma-separated address segments, last one first. The ward is usually the
   * last meaningful segment before the district/city, so probing from the end
   * reaches it soonest.
   */
  private addressSegmentsFromEnd(address: string): string[] {
    return address
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .reverse();
  }

  /**
   * Normalise an administrative unit name for keying/comparison by removing the
   * leading type prefix (Thành phố, Tỉnh, Quận, Huyện, Thị xã, Thị trấn,
   * Phường, Xã and their abbreviations) and lowercasing. This makes matching
   * tolerant of venues that store bare names (e.g. "Hồ Chí Minh", "Bình Tân",
   * "Bình Trị Đông B") against the fully-qualified CSV values.
   */
  private stripAdminPrefix(value: string): string {
    return (
      value
        .trim()
        // Numeric districts/wards: "Quận 1", "Q.1", "Q1", "Phường 25" -> "1"/"25"
        .replace(/^(?:quận|q|phường|p)\.?\s*(?=\d)/i, '')
        // Full-word or abbreviated administrative prefixes
        .replace(
          /^(?:thành\s*phố|tp|tỉnh|quận|q|huyện|h|thị\s*xã|tx|thị\s*trấn|tt|phường|p|xã|x)\.?\s+/i,
          ''
        )
        .trim()
        .toLowerCase()
    );
  }
}
