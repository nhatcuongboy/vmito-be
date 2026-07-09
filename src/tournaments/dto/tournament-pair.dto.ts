import {
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export class SaveTournamentPairDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  playerIds: string[];

  @IsOptional()
  @IsIn([
    'MENS_SINGLE',
    'WOMENS_SINGLE',
    'MENS_DOUBLE',
    'WOMENS_DOUBLE',
    'MIXED_DOUBLE',
    'CUSTOM',
  ])
  type?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertLegacyRegistrationDto extends SaveTournamentPairDto {}
