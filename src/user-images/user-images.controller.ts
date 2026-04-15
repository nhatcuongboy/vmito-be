import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { ImageCategory } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserImagesService } from './user-images.service';

@ApiTags('user-images')
@ApiBearerAuth('JWT-auth')
@Controller('user-images')
@UseGuards(JwtAuthGuard)
export class UserImagesController {
  constructor(private readonly userImagesService: UserImagesService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user images' })
  @ApiQuery({ name: 'category', enum: ImageCategory, required: false })
  @ApiQuery({ name: 'page', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  @ApiResponse({ status: 200, description: 'List of user images' })
  async findAll(
    @CurrentUser() user: { userId: string },
    @Query('category') category?: ImageCategory,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.userImagesService.findAll(user.userId, {
      category,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Upload a new image' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string', enum: Object.values(ImageCategory) },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File,
    @Query('category') category?: ImageCategory
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.userImagesService.upload(
      user.userId,
      file,
      category || ImageCategory.OTHER
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an image' })
  @ApiResponse({ status: 200, description: 'Image deleted successfully' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; role: string }
  ) {
    return this.userImagesService.remove(id, user.userId, user.role);
  }
}
