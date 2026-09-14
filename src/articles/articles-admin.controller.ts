import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ArticlesAdminService } from './articles-admin.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { QueryAdminArticlesDto } from './dto/query-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

interface CurrentUserPayload {
  userId: string;
  role: string;
}

@ApiTags('articles-admin')
@ApiBearerAuth('JWT-auth')
@Controller('admin/articles')
@UseGuards(AdminGuard)
export class ArticlesAdminController {
  constructor(private readonly articlesAdminService: ArticlesAdminService) {}

  @Get()
  findAll(@Query() query: QueryAdminArticlesDto) {
    return this.articlesAdminService.findAll(query);
  }

  @Post()
  create(
    @Body() dto: CreateArticleDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.articlesAdminService.create(dto, user.userId);
  }

  // Declared before ':id' so the literal path isn't swallowed by the param route.
  @Post('upload-cover')
  @UseInterceptors(FileInterceptor('cover'))
  uploadCover(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|gif|webp)$/ }),
        ],
      })
    )
    file: Express.Multer.File
  ) {
    return this.articlesAdminService.uploadCover(file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.articlesAdminService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.articlesAdminService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.articlesAdminService.remove(id);
  }
}
