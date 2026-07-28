import { AddressMappingService } from './address-mapping.service';

/**
 * Seeds the service's in-memory ward mapping directly, bypassing CSV loading
 * (onModuleInit reads from disk, which we don't want in a unit test).
 */
function withWardMapping(
  service: AddressMappingService,
  entries: Array<{
    wardOld: string;
    districtOld: string;
    cityOld: string;
    wardNew: string;
    cityNew: string;
  }>
) {
  const wardMapping = new Map<string, unknown>();
  const strip = (v: string): string =>
    (
      service as unknown as { stripAdminPrefix: (v: string) => string }
    ).stripAdminPrefix(v);
  for (const e of entries) {
    const key = `${strip(e.wardOld)}|${strip(e.districtOld)}|${strip(e.cityOld)}`;
    wardMapping.set(key, {
      cityNameOld: e.cityOld,
      districtNameOld: e.districtOld,
      wardNameOld: e.wardOld,
      cityNameNew: e.cityNew,
      wardNameNew: e.wardNew,
    });
  }
  (service as unknown as { wardMapping: Map<string, unknown> }).wardMapping =
    wardMapping;
  (
    service as unknown as { districtMapping: Map<string, unknown> }
  ).districtMapping = new Map();
}

describe('AddressMappingService', () => {
  let service: AddressMappingService;

  beforeEach(() => {
    service = new AddressMappingService();
  });

  describe('extractStreetAndWard', () => {
    it('splits street from an address with an embedded ward', () => {
      expect(
        service.extractStreetAndWard('108/20 Nguyễn Thượng Hiền, Phường 1')
      ).toEqual({
        streetAddress: '108/20 Nguyễn Thượng Hiền',
        wardOld: 'Phường 1',
      });
    });

    it('returns an empty street when the address is only a ward', () => {
      expect(service.extractStreetAndWard('Phường 1')).toEqual({
        streetAddress: '',
        wardOld: 'Phường 1',
      });
    });

    it('treats the whole string as street when no ward prefix is found', () => {
      expect(service.extractStreetAndWard('108/20 Nguyễn Thượng Hiền')).toEqual(
        {
          streetAddress: '108/20 Nguyễn Thượng Hiền',
          wardOld: null,
        }
      );
    });

    it('recognizes abbreviated numbered wards ("P.9", "P9", "P 9") and still strips trailing district/city text', () => {
      const cases = ['P.9', 'P9', 'P 9'];
      for (const ward of cases) {
        expect(
          service.extractStreetAndWard(
            `202b Đ. Hoàng Văn Thụ, ${ward}, Phú Nhuận, Hồ Chí Minh`
          )
        ).toEqual({ streetAddress: '202b Đ. Hoàng Văn Thụ', wardOld: ward });
      }
    });

    it('leaves trailing district/city text in streetAddress when no ward form is recognized at all (caller must flag this for review)', () => {
      expect(
        service.extractStreetAndWard('12 Nguyễn Huệ, Quận 1, Hồ Chí Minh')
      ).toEqual({
        streetAddress: '12 Nguyễn Huệ, Quận 1, Hồ Chí Minh',
        wardOld: null,
      });
    });

    it('recognizes a ward written without its "Phường" prefix when district/city are supplied', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường Hòa Thuận Nam',
          districtOld: 'Quận Hải Châu',
          cityOld: 'Thành Phố Đà Nẵng',
          wardNew: 'Phường Hải Châu',
          cityNew: 'Thành Phố Đà Nẵng',
        },
      ]);

      expect(
        service.extractStreetAndWard(
          '399 Trưng Nữ Vương, Hòa Thuận Nam, Hải Châu, Đà Nẵng',
          'Hải Châu',
          'Đà Nẵng'
        )
      ).toEqual({
        streetAddress: '399 Trưng Nữ Vương',
        wardOld: 'Hòa Thuận Nam',
      });
    });

    it('does not guess a bare ward without district/city context', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường Hòa Thuận Nam',
          districtOld: 'Quận Hải Châu',
          cityOld: 'Thành Phố Đà Nẵng',
          wardNew: 'Phường Hải Châu',
          cityNew: 'Thành Phố Đà Nẵng',
        },
      ]);

      expect(
        service.extractStreetAndWard(
          '399 Trưng Nữ Vương, Hòa Thuận Nam, Hải Châu, Đà Nẵng'
        )
      ).toEqual({
        streetAddress: '399 Trưng Nữ Vương, Hòa Thuận Nam, Hải Châu, Đà Nẵng',
        wardOld: null,
      });
    });

    it('does not treat an unknown segment as a ward even with district/city context', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường Hòa Thuận Nam',
          districtOld: 'Quận Hải Châu',
          cityOld: 'Thành Phố Đà Nẵng',
          wardNew: 'Phường Hải Châu',
          cityNew: 'Thành Phố Đà Nẵng',
        },
      ]);

      expect(
        service.extractStreetAndWard(
          '399 Trưng Nữ Vương, Toà Nhà ABC, Hải Châu, Đà Nẵng',
          'Hải Châu',
          'Đà Nẵng'
        )
      ).toEqual({
        streetAddress: '399 Trưng Nữ Vương, Toà Nhà ABC, Hải Châu, Đà Nẵng',
        wardOld: null,
      });
    });
  });

  describe('resolve', () => {
    it('composes newAddress with street + new ward + new city on a ward match', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường 1',
          districtOld: 'Gò Vấp',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Hạnh Thông',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      const result = service.resolve(
        '108/20 Nguyễn Thượng Hiền, Phường 1',
        'Gò Vấp',
        'Hồ Chí Minh'
      );

      // newCity is recorded even though the province name is unchanged: the
      // column means "city in the new era", not "city that changed".
      expect(result).toEqual({
        newAddress:
          '108/20 Nguyễn Thượng Hiền, Phường Hạnh Thông, Thành Phố Hồ Chí Minh',
        newDistrict: 'Phường Hạnh Thông',
        newCity: 'Thành Phố Hồ Chí Minh',
      });
    });

    it('uses the persisted streetAddress instead of re-parsing address', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường 1',
          districtOld: 'Gò Vấp',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Hạnh Thông',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      const result = service.resolve(
        '108/20 Nguyễn Thượng Hiền, Phường 1',
        'Gò Vấp',
        'Hồ Chí Minh',
        '108/20B Nguyễn Thượng Hiền (sau nhà thờ)'
      );

      expect(result?.newAddress).toBe(
        '108/20B Nguyễn Thượng Hiền (sau nhà thờ), Phường Hạnh Thông, Thành Phố Hồ Chí Minh'
      );
    });

    it('omits the street segment when the address has no house number (no regression)', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường 1',
          districtOld: 'Gò Vấp',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Hạnh Thông',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      const result = service.resolve('Phường 1', 'Gò Vấp', 'Hồ Chí Minh');

      expect(result).toEqual({
        newAddress: 'Phường Hạnh Thông, Thành Phố Hồ Chí Minh',
        newDistrict: 'Phường Hạnh Thông',
        newCity: 'Thành Phố Hồ Chí Minh',
      });
    });

    it('keeps the stale district/city out of newAddress when the ward has no prefix', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường Hòa Thuận Nam',
          districtOld: 'Quận Hải Châu',
          cityOld: 'Thành Phố Đà Nẵng',
          wardNew: 'Phường Hải Châu',
          cityNew: 'Thành Phố Đà Nẵng',
        },
      ]);

      const result = service.resolve(
        '399 Trưng Nữ Vương, Hòa Thuận Nam, Hải Châu, Đà Nẵng',
        'Hải Châu',
        'Đà Nẵng'
      );

      expect(result).toEqual({
        newAddress: '399 Trưng Nữ Vương, Phường Hải Châu, Thành Phố Đà Nẵng',
        newDistrict: 'Phường Hải Châu',
        newCity: 'Thành Phố Đà Nẵng',
      });
    });

    it('falls back to district-level match (newCity only) when no ward matches but the province changed', () => {
      // Ward mapping only needs to be non-empty to pass the service's guard;
      // the district-level fallback is exercised via districtMapping below.
      withWardMapping(service, [
        {
          wardOld: 'Phường 1',
          districtOld: 'Gò Vấp',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Hạnh Thông',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);
      (
        service as unknown as { districtMapping: Map<string, unknown> }
      ).districtMapping = new Map([
        [
          'dĩ an|bình dương',
          { cityNameNew: 'Thành Phố Hồ Chí Minh', districtNameOld: 'Dĩ An' },
        ],
      ]);

      const result = service.resolve(
        '99 Đường Không Tồn Tại, Phường Không Khớp',
        'Dĩ An',
        'Bình Dương'
      );

      expect(result).toEqual({ newCity: 'Thành Phố Hồ Chí Minh' });
    });

    it('does not mistake the district segment for a same-named ward', () => {
      // "Phường 3" inside "Quận 3" is one of many ward/district name
      // collisions. An address that only states its district must not be
      // resolved to that ward's new name.
      withWardMapping(service, [
        {
          wardOld: 'Phường 3',
          districtOld: 'Quận 3',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Bàn Cờ',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      expect(
        service.resolve(
          '123 Lê Lợi, Quận 3, Hồ Chí Minh',
          'Quận 3',
          'Hồ Chí Minh'
        )
      ).toBeNull();
    });

    it('still matches a ward that shares its district name when spelled out', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường 3',
          districtOld: 'Quận 3',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Bàn Cờ',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      expect(
        service.resolve(
          '123 Lê Lợi, Phường 3, Quận 3, Hồ Chí Minh',
          'Quận 3',
          'Hồ Chí Minh'
        )
      ).toEqual({
        newAddress: '123 Lê Lợi, Phường Bàn Cờ, Thành Phố Hồ Chí Minh',
        newDistrict: 'Phường Bàn Cờ',
        newCity: 'Thành Phố Hồ Chí Minh',
      });
    });

    it('returns null when nothing matches', () => {
      withWardMapping(service, [
        {
          wardOld: 'Phường 1',
          districtOld: 'Gò Vấp',
          cityOld: 'Hồ Chí Minh',
          wardNew: 'Phường Hạnh Thông',
          cityNew: 'Thành Phố Hồ Chí Minh',
        },
      ]);

      const result = service.resolve('123 Đường Lạ', 'Quận Lạ', 'Tỉnh Lạ');

      expect(result).toBeNull();
    });
  });
});
