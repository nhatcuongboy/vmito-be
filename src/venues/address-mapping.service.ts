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

    const wardName = this.extractWardFromAddress(address);
    let found: AddressMapping | undefined;

    if (wardName && district && city) {
      const normalizedCity = this.normalizeCityName(city);
      const normalizedDistrict = this.normalizeDistrictName(district);

      const districtVariants = [
        normalizedDistrict,
        district.toLowerCase().startsWith('quận') ||
        district.toLowerCase().startsWith('huyện')
          ? normalizedDistrict
          : `quận ${normalizedDistrict}`,
      ];

      for (const distVar of districtVariants) {
        const key = `${wardName.toLowerCase()}|${distVar}|${normalizedCity}`;
        found = this.wardMapping.get(key);
        if (found) break;
      }

      // Fuzzy fallback: ward + district substring match
      if (!found) {
        const wardLower = wardName.toLowerCase();
        const distLower = this.normalizeDistrictName(district);
        for (const [key, entry] of this.wardMapping.entries()) {
          if (key.startsWith(`${wardLower}|`) && key.includes(distLower)) {
            found = entry;
            break;
          }
        }
      }
    }

    if (found) {
      const normalizedCity = this.normalizeCityName(city);
      const newAddress = `${found.wardNameNew}, ${found.cityNameNew}`;
      const newCity =
        found.cityNameNew.toLowerCase() !== normalizedCity
          ? found.cityNameNew
          : undefined;
      return {
        newAddress,
        newDistrict: found.wardNameNew,
        ...(newCity ? { newCity } : {}),
      };
    }

    // District-level fallback: only resolve a changed province
    if (district && city) {
      const normalizedCity = this.normalizeCityName(city);
      const normalizedDistrict = this.normalizeDistrictName(district);

      const districtVariants = [
        normalizedDistrict,
        district.toLowerCase().startsWith('quận') ||
        district.toLowerCase().startsWith('huyện')
          ? normalizedDistrict
          : `quận ${normalizedDistrict}`,
      ];

      for (const distVar of districtVariants) {
        const key = `${distVar}|${normalizedCity}`;
        const distEntry = this.districtMapping.get(key);
        if (distEntry) {
          const newCity =
            distEntry.cityNameNew.toLowerCase() !== normalizedCity
              ? distEntry.cityNameNew
              : undefined;
          if (newCity) return { newCity };
          break;
        }
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

      const key =
        `${wardNameOld}|${districtNameOld}|${cityNameOld}`.toLowerCase();
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
      const key = `${entry.districtNameOld}|${entry.cityNameOld}`.toLowerCase();
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

  private normalizeCityName(city: string): string {
    return city
      .replace(/^(?:Tp|TP)(?=[.\s])\.?\s*/i, 'Thành Phố ')
      .replace(/^T(?=\.)\.\s*/i, 'Thành Phố ')
      .trim()
      .toLowerCase();
  }

  private normalizeDistrictName(district: string): string {
    return district
      .replace(/^Q(?=[.\s\d])\.?\s*/i, 'Quận ')
      .replace(/^H(?=[.\s\d])\.?\s*/i, 'Huyện ')
      .replace(/^TX(?=[.\s\d])\.?\s*/i, 'Thị xã ')
      .trim()
      .toLowerCase();
  }
}
