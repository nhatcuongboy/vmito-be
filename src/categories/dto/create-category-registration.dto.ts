import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateCategoryRegistrationDto {
  @IsOptional()
  @IsString()
  tournamentPlayerId?: string;

  @ValidateIf((o: CreateCategoryRegistrationDto) => !o.tournamentPlayerId)
  @IsString({
    message: 'Either tournamentPlayerId or tournamentPairId must be provided',
  })
  tournamentPairId?: string;
}
