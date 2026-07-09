import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { FavoriteType } from '@prisma/client';

export class CreateFavoriteDto {
  @ApiProperty({ enum: FavoriteType })
  @IsEnum(FavoriteType)
  type: FavoriteType;

  @ApiProperty()
  @IsString()
  targetId: string;
}
