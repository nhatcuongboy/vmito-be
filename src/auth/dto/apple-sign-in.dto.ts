import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AppleSignInDto {
  /** The JWT returned by `ASAuthorizationAppleIDCredential.identityToken`. */
  @ApiProperty({ description: 'Apple identity token (JWT)' })
  @IsString()
  @MinLength(1)
  identityToken!: string;

  /**
   * Apple returns the display name **only on the first authorization** for a
   * given app. If it is not captured then, the account has no name forever —
   * re-authorizing does not send it again. Clients must pass it through here.
   */
  @ApiPropertyOptional({
    description:
      'Given name. Apple provides this only on the first authorization.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  givenName?: string;

  @ApiPropertyOptional({
    description:
      'Family name. Apple provides this only on the first authorization.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  familyName?: string;
}
