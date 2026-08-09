import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ClassSocialLinksDto, CreateClassDto } from './create-class.dto';

describe('CreateClassDto zaloUrl', () => {
  const zaloUrlErrors = async (zaloUrl: string | undefined) => {
    const dto = Object.assign(new CreateClassDto(), { zaloUrl });
    const errors = await validate(dto, { skipMissingProperties: true });
    return errors.filter((error) => error.property === 'zaloUrl');
  };

  it('accepts an omitted or empty Zalo URL', async () => {
    await expect(zaloUrlErrors(undefined)).resolves.toHaveLength(0);
    await expect(zaloUrlErrors('')).resolves.toHaveLength(0);
  });

  it('accepts a valid URL and rejects a malformed value', async () => {
    await expect(
      zaloUrlErrors('https://zalo.me/0914810765')
    ).resolves.toHaveLength(0);
    await expect(zaloUrlErrors('zalo.me/0914810765')).resolves.toHaveLength(1);
  });

  it('validates social links while allowing empty values to clear them', async () => {
    const valid = plainToInstance(ClassSocialLinksDto, {
      facebook: '',
      website: 'https://vmito.com',
    });
    const invalid = plainToInstance(ClassSocialLinksDto, {
      tiktok: 'tiktok.com/@vmito',
    });

    await expect(validate(valid)).resolves.toHaveLength(0);
    await expect(validate(invalid)).resolves.toHaveLength(1);
  });
});
