import { SportType } from '@prisma/client';
import { AddressMappingService } from './address-mapping.service';
import { VenueAddressMigrationService } from './venue-address-migration.service';

type VenueRow = {
  id: string;
  name: string;
  address: string;
  district: string;
  city: string;
  sportType: SportType;
  streetAddress: string | null;
  searchTerms: string | null;
  newAddress: string | null;
};

/**
 * Seeds the mapping service's in-memory tables directly — onModuleInit reads
 * the CSV off disk, which a unit test should not depend on.
 */
function seedMapping(
  service: AddressMappingService,
  entries: Array<{
    wardOld: string;
    districtOld: string;
    cityOld: string;
    wardNew: string;
    cityNew: string;
  }>
) {
  const strip = (v: string): string =>
    (
      service as unknown as { stripAdminPrefix: (v: string) => string }
    ).stripAdminPrefix(v);

  const wardMapping = new Map<string, unknown>();
  const districtMapping = new Map<string, unknown>();
  for (const e of entries) {
    wardMapping.set(
      `${strip(e.wardOld)}|${strip(e.districtOld)}|${strip(e.cityOld)}`,
      {
        cityNameOld: e.cityOld,
        districtNameOld: e.districtOld,
        wardNameOld: e.wardOld,
        cityNameNew: e.cityNew,
        wardNameNew: e.wardNew,
      }
    );
    const distKey = `${strip(e.districtOld)}|${strip(e.cityOld)}`;
    if (!districtMapping.has(distKey)) {
      districtMapping.set(distKey, {
        cityNameNew: e.cityNew,
        districtNameOld: e.districtOld,
      });
    }
  }
  (service as unknown as { wardMapping: Map<string, unknown> }).wardMapping =
    wardMapping;
  (
    service as unknown as { districtMapping: Map<string, unknown> }
  ).districtMapping = districtMapping;
}

function makePrisma(rows: VenueRow[]) {
  const updates: { id: string; data: Record<string, unknown> }[] = [];
  return {
    updates,
    prisma: {
      venue: {
        findMany: jest.fn(
          ({ where }: { where: Record<string, unknown> }) =>
            Promise.resolve(
              'newAddress' in where
                ? rows.filter((r) => r.newAddress === null)
                : rows
            ) as unknown as Promise<VenueRow[]>
        ),
        update: jest.fn(
          ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            updates.push({ id: where.id, data });
            return Promise.resolve({});
          }
        ),
      },
    },
  };
}

const BASE: Omit<VenueRow, 'id' | 'address' | 'district' | 'city'> = {
  name: 'Sân A',
  sportType: SportType.BADMINTON,
  streetAddress: null,
  searchTerms: null,
  newAddress: null,
};

describe('VenueAddressMigrationService', () => {
  let mapping: AddressMappingService;

  beforeEach(() => {
    mapping = new AddressMappingService();
    seedMapping(mapping, [
      {
        wardOld: 'Phường 7',
        districtOld: 'Thành Phố Vũng Tàu',
        cityOld: 'Tỉnh Bà Rịa-Vũng Tàu',
        wardNew: 'Phường Tam Thắng',
        cityNew: 'Thành Phố Hồ Chí Minh',
      },
      {
        wardOld: 'Phường 1',
        districtOld: 'Quận Phú Nhuận',
        cityOld: 'Thành Phố Hồ Chí Minh',
        wardNew: 'Phường Phú Nhuận',
        cityNew: 'Thành Phố Hồ Chí Minh',
      },
    ]);
  });

  const build = (rows: VenueRow[]) => {
    const { prisma, updates } = makePrisma(rows);
    const service = new VenueAddressMigrationService(prisma as never, mapping);
    return { service, updates, prisma };
  };

  it('writes the full new-era address when the ward resolves', async () => {
    const { service, updates } = build([
      {
        ...BASE,
        id: 'v1',
        address: '12 Lê Lợi, Phường 7',
        district: 'Vũng Tàu',
        city: 'Bà Rịa - Vũng Tàu',
      },
    ]);

    const result = await service.migrateAddresses();

    expect(result.matched).toBe(1);
    expect(result.needsReview).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].data).toMatchObject({
      streetAddress: '12 Lê Lợi',
      wardOld: 'Phường 7',
      newAddress: '12 Lê Lợi, Phường Tam Thắng, Thành Phố Hồ Chí Minh',
      newDistrict: 'Phường Tam Thắng',
      newCity: 'Thành Phố Hồ Chí Minh',
    });
    expect(updates[0].data.searchTerms).toContain('tam thang');
  });

  it('records only the new province when the ward cannot be identified', async () => {
    const { service, updates } = build([
      {
        ...BASE,
        id: 'v2',
        address: '55 Trần Phú',
        district: 'Vũng Tàu',
        city: 'Bà Rịa - Vũng Tàu',
      },
    ]);

    const result = await service.migrateAddresses();

    expect(result.cityOnly).toBe(1);
    expect(result.matched).toBe(0);
    expect(updates[0].data).toEqual(
      expect.objectContaining({ newCity: 'Thành Phố Hồ Chí Minh' })
    );
    // The whole address would have been mistaken for the street — a ward was
    // never identified, so neither column may be written.
    expect(updates[0].data).not.toHaveProperty('streetAddress');
    expect(updates[0].data).not.toHaveProperty('wardOld');
  });

  it('leaves an unmappable venue untouched and reports it for review', async () => {
    const { service, updates } = build([
      {
        ...BASE,
        id: 'v3',
        address: 'Khu công nghiệp ABC',
        district: 'Không Rõ',
        city: 'Không Rõ',
      },
    ]);

    const result = await service.migrateAddresses();

    expect(result.needsReview).toBe(1);
    expect(updates).toHaveLength(0);
    expect(result.needsReviewSamples).toEqual([
      {
        id: 'v3',
        name: 'Sân A',
        address: 'Khu công nghiệp ABC',
        district: 'Không Rõ',
        city: 'Không Rõ',
      },
    ]);
  });

  it('writes nothing on a dry run but still reports the counts', async () => {
    const { service, updates } = build([
      {
        ...BASE,
        id: 'v1',
        address: '12 Lê Lợi, Phường 7',
        district: 'Vũng Tàu',
        city: 'Bà Rịa - Vũng Tàu',
      },
    ]);

    const result = await service.migrateAddresses({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.matched).toBe(1);
    expect(updates).toHaveLength(0);
  });

  it('skips already-migrated venues unless rescan is set', async () => {
    const rows: VenueRow[] = [
      {
        ...BASE,
        id: 'v1',
        address: '12 Lê Lợi, Phường 7',
        district: 'Vũng Tàu',
        city: 'Bà Rịa - Vũng Tàu',
        newAddress: 'stale value',
      },
    ];

    const withoutRescan = build(rows);
    expect((await withoutRescan.service.migrateAddresses()).total).toBe(0);

    const withRescan = build(rows);
    const result = await withRescan.service.migrateAddresses({ rescan: true });
    expect(result.total).toBe(1);
    expect(result.rescan).toBe(true);
    expect(withRescan.updates[0].data.newAddress).toBe(
      '12 Lê Lợi, Phường Tam Thắng, Thành Phố Hồ Chí Minh'
    );
  });

  it('re-derives the street on rescan instead of trusting a stale stored one', async () => {
    const { service, updates } = build([
      {
        ...BASE,
        id: 'v1',
        address: '12 Lê Lợi, Phường 7',
        district: 'Vũng Tàu',
        city: 'Bà Rịa - Vũng Tàu',
        newAddress: 'stale',
        streetAddress: '12 Lê Lợi, Phường 7, Vũng Tàu',
      },
    ]);

    await service.migrateAddresses({ rescan: true });

    expect(updates[0].data.streetAddress).toBe('12 Lê Lợi');
    expect(updates[0].data.newAddress).toBe(
      '12 Lê Lợi, Phường Tam Thắng, Thành Phố Hồ Chí Minh'
    );
  });
});
