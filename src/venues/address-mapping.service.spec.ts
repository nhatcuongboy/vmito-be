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

      // newCity is omitted here because the province name is unchanged
      // ("Hồ Chí Minh" -> "Thành Phố Hồ Chí Minh" normalizes to the same key).
      expect(result).toEqual({
        newAddress:
          '108/20 Nguyễn Thượng Hiền, Phường Hạnh Thông, Thành Phố Hồ Chí Minh',
        newDistrict: 'Phường Hạnh Thông',
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
