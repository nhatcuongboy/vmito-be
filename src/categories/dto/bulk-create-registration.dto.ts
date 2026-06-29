import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

export class BulkCreateRegistrationDto {
  // One entry per team/player to create. For TEAM categories each name becomes
  // a new pair (empty roster); for INDIVIDUAL categories each name becomes a
  // new player. Everything is created in a single request + transaction so the
  // client makes one round-trip instead of two calls per row.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  names: string[];
}
