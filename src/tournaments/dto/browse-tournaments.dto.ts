import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  Matches,
  IsOptional,
  IsString,
} from 'class-validator';
import { SportType, TournamentStatus } from '@prisma/client';

const toArray = ({ value }: { value: string | string[] }) =>
  Array.isArray(value) ? value : value.split(',').filter(Boolean);

const toBoolean = ({ value }: { value: boolean | string }) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
};

export class BrowseTournamentsDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Transform(toArray)
  @IsEnum(TournamentStatus, { each: true })
  status?: TournamentStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsEnum(SportType, { each: true })
  sportType?: SportType[];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @IsOptional()
  @IsIn(['startDate', 'createdAt', 'name'])
  sortBy?: 'startDate' | 'createdAt' | 'name';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  favoriteOnly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  publishedOnly?: boolean;
}
