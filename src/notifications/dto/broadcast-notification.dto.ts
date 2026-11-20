import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

export class BroadcastNotificationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  link?: string;

  /**
   * Shown large in the push (Android big picture, iOS attachment through the
   * app's Notification Service Extension). Public https, ideally 2:1.
   */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(1000)
  imageUrl?: string;

  /**
   * In-app screen the mobile app opens on tap (`/live-score/record`). A path,
   * not a URL: `link` is the external one and wins when both are set.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\/(?!\/)/, {
    message: 'route must be an in-app path starting with /',
  })
  @MaxLength(200)
  route?: string;
}
