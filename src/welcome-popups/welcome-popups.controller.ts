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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CreateWelcomePopupDto } from './dto/create-welcome-popup.dto';
import { UpdateWelcomePopupDto } from './dto/update-welcome-popup.dto';
import { WelcomePopupsService } from './welcome-popups.service';

interface CurrentUserPayload {
  userId: string;
  role: string;
}

@ApiTags('welcome-popups')
@ApiBearerAuth('JWT-auth')
@Controller()
export class WelcomePopupsController {
  constructor(private readonly welcomePopupsService: WelcomePopupsService) {}

  @Public()
  @Get('welcome-popups/active')
  getActive() {
    return this.welcomePopupsService.getActive();
  }

  @Get('admin/welcome-popups')
  @UseGuards(AdminGuard)
  findAll() {
    return this.welcomePopupsService.findAll();
  }

  @Post('admin/welcome-popups')
  @UseGuards(AdminGuard)
  create(
    @Body() dto: CreateWelcomePopupDto,
    @CurrentUser() user: CurrentUserPayload
  ) {
    return this.welcomePopupsService.create(dto, user.userId);
  }

  @Put('admin/welcome-popups/:id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() dto: UpdateWelcomePopupDto) {
    return this.welcomePopupsService.update(id, dto);
  }

  @Delete('admin/welcome-popups/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.welcomePopupsService.remove(id);
  }

  @Post('admin/welcome-popups/upload-banner')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('banner'))
  uploadBanner(
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
    return this.welcomePopupsService.uploadBanner(file);
  }
}
