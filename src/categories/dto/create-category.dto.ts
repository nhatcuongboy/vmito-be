import { IsString, IsIn, IsOptional, IsInt, Min } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsIn([
    'MENS_SINGLE',
    'WOMENS_SINGLE',
    'MENS_DOUBLE',
    'WOMENS_DOUBLE',
    'MIXED_DOUBLE',
    'CUSTOM',
  ])
  type: string;

  @IsOptional()
  @IsIn(['ROUND_ROBIN', 'SINGLE_ELIMINATION', 'ROUND_ROBIN_TO_SE'])
  format?: string;

  @IsOptional()
  @IsIn(['INDIVIDUAL', 'TEAM'])
  registrationMode?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamSize?: number;
}
