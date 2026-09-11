import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BrowseClubsDto } from './browse-clubs.dto';

describe('BrowseClubsDto activity-time and level params', () => {
  it('splits comma-separated query strings into arrays', () => {
    const dto = plainToInstance(BrowseClubsDto, {
      levels: '3,9',
      activeDays: '0,6',
      activePeriods: 'morning,evening',
    });

    expect(dto.levels).toEqual([3, 9]);
    expect(dto.activeDays).toEqual([0, 6]);
    expect(dto.activePeriods).toEqual(['morning', 'evening']);
  });

  it('omits every optional filter when absent', async () => {
    const dto = plainToInstance(BrowseClubsDto, {});
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.levels).toBeUndefined();
    expect(dto.activeDays).toBeUndefined();
    expect(dto.activePeriods).toBeUndefined();
  });

  it('rejects a level outside 1-10, a weekday outside 0-6, and an unknown period', async () => {
    const dto = plainToInstance(BrowseClubsDto, {
      levels: '11',
      activeDays: '7',
      activePeriods: 'noon',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property).sort();
    expect(properties).toEqual(['activeDays', 'activePeriods', 'levels']);
  });
});
