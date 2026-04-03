import { IsString, IsIn, IsOptional } from 'class-validator';

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
}
