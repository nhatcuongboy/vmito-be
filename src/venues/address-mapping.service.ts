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

@Injectable()
export class AddressMappingService implements OnModuleInit {
  private static readonly CSV_FILENAME = 'admin_mapping_old_to_new_10_25.csv';
  private readonly logger = new Logger(AddressMappingService.name);
  private wardMapping = new Map<string, AddressMapping>();
  private districtMapping = new Map<
    string,
    { cityNameNew: string; districtNameOld: string }
  >();

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
    this.logger.log(
      `Loaded ${this.wardMapping.size} ward-level address mappings from ${csvPath}`
    );
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
   * - Ward-level match: returns newAddress, newDistrict, and optionally newCity
   * - District-level match: returns only newCity (if the province changed)
   */
  resolve(
    address: string,
    district: string,
    city: string
  ): ResolvedAddress | null {
    if (!this.wardMapping.size) return null;

    const distKey = this.stripAdminPrefix(district);
    const cityKey = this.stripAdminPrefix(city);

    let found: AddressMapping | undefined;

    if (distKey && cityKey) {
      const wardCandidates = this.extractWardCandidates(address);

      // Exact ward match: ward + district + city
      for (const candidate of wardCandidates) {
        const wardKey = this.stripAdminPrefix(candidate);
        if (!wardKey) continue;
        found = this.wardMapping.get(`${wardKey}|${distKey}|${cityKey}`);
        if (found) break;
      }

      // Fuzzy fallback: ward + district match, ignore city naming variations
      if (!found) {
        const prefix = `|${distKey}|`;
        for (const candidate of wardCandidates) {
          const wardKey = this.stripAdminPrefix(candidate);
          if (!wardKey) continue;
          for (const [key, entry] of this.wardMapping.entries()) {
            if (key.startsWith(`${wardKey}${prefix}`)) {
              found = entry;
              break;
            }
          }
          if (found) break;
        }
      }
    }

    if (found) {
      const newAddress = `${found.wardNameNew}, ${found.cityNameNew}`;
      const newCity =
        this.stripAdminPrefix(found.cityNameNew) !== cityKey
          ? found.cityNameNew
          : undefined;
      return {
        newAddress,
        newDistrict: found.wardNameNew,
        ...(newCity ? { newCity } : {}),
      };
    }

    // District-level fallback: only resolve a changed province
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

  private extractWardFromAddress(address: string): string | null {
    const wardPatterns = [
      /(?:,\s*)(Phường\s+[^,]+)/i,
      /(?:,\s*)(Xã\s+[^,]+)/i,
      /(?:,\s*)(Thị\s+[Tt]rấn\s+[^,]+)/i,
      /^(Phường\s+[^,]+)/i,
      /^(Xã\s+[^,]+)/i,
    ];
    for (const pattern of wardPatterns) {
      const match = address.match(pattern);
      if (match) return match[1].trim();
    }
    return null;
  }

  /**
   * Build the list of candidate ward names embedded in an address. Some
   * addresses use an explicit "Phường/Xã/Thị trấn" prefix, others store the
   * bare ward name as one of the comma-separated segments, so we try both.
   */
  private extractWardCandidates(address: string): string[] {
    const candidates: string[] = [];
    const prefixed = this.extractWardFromAddress(address);
    if (prefixed) candidates.push(prefixed);

    // Ward is usually the last meaningful segment before district/city, so
    // probe segments from the end of the address first.
    const segments = address
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .reverse();
    for (const seg of segments) {
      if (!candidates.includes(seg)) candidates.push(seg);
    }
    return candidates;
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
