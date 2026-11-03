import { ApiProperty } from '@nestjs/swagger';
import { ViewTargetType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class TrackViewDto {
  @ApiProperty({ enum: ViewTargetType })
  @IsEnum(ViewTargetType)
  targetType: ViewTargetType;

  @ApiProperty({
    description: 'ID of the venue, club, class, or session being viewed',
  })
  @IsString()
  targetId: string;
}
