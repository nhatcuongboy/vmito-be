import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectVenueRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  adminNote!: string;
}
