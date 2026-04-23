import { PrismaClient } from '@prisma/client';
import { removeVietnameseTones } from '../src/common/utils/string.utils';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface AddressMapping {
  cityNameOld: string;
  districtNameOld: string;
  wardNameOld: string;
  cityNameNew: string;
  wardNameNew: string;
}

/**
 * Parse the CSV mapping file and build a lookup structure.
 * Key: normalized "wardNameOld|districtNameOld|cityNameOld"
 * Value: first matching new address (since one old ward can map to multiple new wards,
 *        we pick the first one; manual review may be needed for split wards)
 */
function loadMappingFromCsv(csvPath: string): Map<string, AddressMapping> {
  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  const mapping = new Map<string, AddressMapping>();

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < 10) continue;

    const cityNameOld = cols[1].trim();
    const districtNameOld = cols[3].trim();
    const wardNameOld = cols[5].trim();
    const cityNameNew = cols[7].trim();
    const wardNameNew = cols[9].trim();

    // Build lookup key from old address parts (normalized lowercase)
    const key =
      `${wardNameOld}|${districtNameOld}|${cityNameOld}`.toLowerCase();

    // Only store the first mapping for each old ward (avoid overwrite from split wards)
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

/**
 * Build a district-level mapping for venues where we can't match ward-level.
 * Key: normalized "districtNameOld|cityNameOld"
 * Value: the first new city name found for that district
 */
function buildDistrictMapping(
  wardMapping: Map<string, AddressMapping>,
): Map<string, { cityNameNew: string; districtNameOld: string }> {
  const districtMap = new Map<
    string,
    { cityNameNew: string; districtNameOld: string }
  >();

  for (const entry of wardMapping.values()) {
    const key =
      `${entry.districtNameOld}|${entry.cityNameOld}`.toLowerCase();
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
 * Try to extract a ward name from the venue address string.
 * Common patterns: "123 Đường ABC, Phường XYZ, Quận ABC, TP HCM"
 */
function extractWardFromAddress(address: string): string | null {
  // Match "Phường X" or "Xã X" or "Thị trấn X" in the address
  const wardPatterns = [
    /(?:,\s*)(Phường\s+[^,]+)/i,
    /(?:,\s*)(Xã\s+[^,]+)/i,
    /(?:,\s*)(Thị\s+[Tt]rấn\s+[^,]+)/i,
    /^(Phường\s+[^,]+)/i,
    /^(Xã\s+[^,]+)/i,
  ];

  for (const pattern of wardPatterns) {
    const match = address.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * Normalize city name for matching.
 * "Tp Hồ Chí Minh" or "TP. Hồ Chí Minh" -> "thành phố hồ chí minh"
 */
function normalizeCityName(city: string): string {
  return city
    .replace(/^(Tp\.?\s*|TP\.?\s*)/i, 'Thành Phố ')
    .replace(/^(T\.\s*)/i, 'Thành Phố ')
    .trim()
    .toLowerCase();
}

/**
 * Normalize district name for matching.
 * "Q. Phú Nhuận" or "Quận Phú Nhuận" or "Phú Nhuận" -> "quận phú nhuận"
 */
function normalizeDistrictName(district: string): string {
  // If it doesn't already start with a prefix, we can't know - try both
  const cleaned = district
    .replace(/^(Q\.?\s*)/i, 'Quận ')
    .replace(/^(H\.?\s*)/i, 'Huyện ')
    .replace(/^(TX\.?\s*)/i, 'Thị xã ')
    .trim()
    .toLowerCase();
  return cleaned;
}

async function main() {
  const csvPath = path.resolve(
    __dirname,
    '../admin_mapping_old_to_new_10_25.csv',
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV mapping file not found at: ${csvPath}`);
    process.exit(1);
  }

  console.log('Loading CSV mapping...');
  const wardMapping = loadMappingFromCsv(csvPath);
  console.log(`Loaded ${wardMapping.size} ward-level mappings`);

  const districtMapping = buildDistrictMapping(wardMapping);
  console.log(`Built ${districtMapping.size} district-level mappings`);

  console.log('Fetching venues from database...');
  const venues = await prisma.venue.findMany({
    where: { newAddress: null },
    select: {
      id: true,
      address: true,
      district: true,
      city: true,
      name: true,
      searchTerms: true,
    },
  });
  console.log(`Found ${venues.length} venues without newAddress`);

  let matched = 0;
  let districtMatched = 0;
  let unmatched = 0;

  for (const venue of venues) {
    const city = venue.city || '';
    const district = venue.district || '';
    const address = venue.address || '';

    // Try ward-level matching
    const wardName = extractWardFromAddress(address);
    let found: AddressMapping | undefined;

    if (wardName && district && city) {
      // Try exact match with full district prefix
      const normalizedCity = normalizeCityName(city);
      const normalizedDistrict = normalizeDistrictName(district);

      // Try matching with "Quận" prefix if district doesn't have one
      const districtVariants = [
        normalizedDistrict,
        district.toLowerCase().startsWith('quận') ||
        district.toLowerCase().startsWith('huyện')
          ? normalizedDistrict
          : `quận ${normalizedDistrict}`,
      ];

      for (const distVar of districtVariants) {
        // Try with full city name variants
        for (const cityVar of [normalizedCity]) {
          const key = `${wardName.toLowerCase()}|${distVar}|${cityVar}`;
          found = wardMapping.get(key);
          if (found) break;
        }
        if (found) break;
      }

      // Try broader city matching - iterate mapping to find fuzzy match
      if (!found) {
        const wardLower = wardName.toLowerCase();
        const distLower = normalizedDistrict;
        for (const [key, entry] of wardMapping.entries()) {
          if (
            key.startsWith(`${wardLower}|`) &&
            key.includes(distLower)
          ) {
            found = entry;
            break;
          }
        }
      }
    }

    if (found) {
      const newAddress = `${found.wardNameNew}, ${found.cityNameNew}`;
      const newCity =
        found.cityNameNew.toLowerCase() !== normalizeCityName(city)
          ? found.cityNameNew
          : null;

      const searchTerms = removeVietnameseTones(
        `${venue.name} ${venue.address} ${district} ${city} ${newAddress} ${found.wardNameNew} ${newCity || ''}`,
      ).toLowerCase();

      await prisma.venue.update({
        where: { id: venue.id },
        data: {
          newAddress,
          newDistrict: found.wardNameNew,
          ...(newCity ? { newCity } : {}),
          searchTerms,
        },
      });
      matched++;
      continue;
    }

    // Try district-level matching (at least set newCity if the province changed)
    if (district && city) {
      const normalizedCity = normalizeCityName(city);
      const normalizedDistrict = normalizeDistrictName(district);

      const districtVariants = [
        normalizedDistrict,
        district.toLowerCase().startsWith('quận') ||
        district.toLowerCase().startsWith('huyện')
          ? normalizedDistrict
          : `quận ${normalizedDistrict}`,
      ];

      for (const distVar of districtVariants) {
        const key = `${distVar}|${normalizedCity}`;
        const distEntry = districtMapping.get(key);
        if (distEntry) {
          const newCity =
            distEntry.cityNameNew.toLowerCase() !== normalizedCity
              ? distEntry.cityNameNew
              : null;

          if (newCity) {
            await prisma.venue.update({
              where: { id: venue.id },
              data: { newCity },
            });
            districtMatched++;
          }
          break;
        }
      }

      if (districtMatched > 0) continue;
    }

    unmatched++;
    console.log(
      `  [UNMATCHED] ${venue.name} | ${address} | ${district}, ${city}`,
    );
  }

  console.log('\n--- Migration Summary ---');
  console.log(`Total venues processed: ${venues.length}`);
  console.log(`Ward-level matched: ${matched}`);
  console.log(`District-level matched (city only): ${districtMatched}`);
  console.log(`Unmatched (needs manual review): ${unmatched}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
