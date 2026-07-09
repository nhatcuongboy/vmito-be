import { IsInt, IsString, Max, Min } from 'class-validator';

export class ClubMonthlyMemberQueryDto {
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;
}

export class UpsertClubMonthlyMemberDto extends ClubMonthlyMemberQueryDto {
  @IsString()
  userId: string;
}
