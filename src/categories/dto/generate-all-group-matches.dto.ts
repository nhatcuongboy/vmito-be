import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateAllGroupMatchesDto {
  @IsBoolean()
  @IsOptional()
  forceReplaceScheduledMatches?: boolean;
}
