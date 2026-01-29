import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({ description: 'Secure URL of the uploaded image' })
  url: string;

  @ApiProperty({ description: 'Cloudinary public ID' })
  publicId: string;

  @ApiProperty({ description: 'Image format' })
  format: string;

  @ApiProperty({ description: 'Image width in pixels' })
  width: number;

  @ApiProperty({ description: 'Image height in pixels' })
  height: number;

  @ApiProperty({ description: 'File size in bytes' })
  bytes: number;
}
