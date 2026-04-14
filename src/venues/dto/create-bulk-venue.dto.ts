import { ApiProperty } from '@nestjs/swagger';
import { ValidateNested, IsArray, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateVenueDto } from './create-venue.dto';

export class CreateBulkVenueDto {
  @ApiProperty({
    type: [CreateVenueDto],
    description: 'Array of venues to create',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVenueDto)
  venues: CreateVenueDto[];
}
