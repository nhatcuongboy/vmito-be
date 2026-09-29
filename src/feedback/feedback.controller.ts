import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import {
  CreateFeedbackDto,
  QueryFeedbackDto,
  UpdateFeedbackStatusDto,
} from './dto';

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly cloudinaryService: CloudinaryService
  ) {}

  @Post()
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: { userId: string }
  ) {
    return this.feedbackService.create(dto, user.userId);
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(@UploadedFile() file: Express.Multer.File) {
    const result = await this.cloudinaryService.uploadFeedbackImage(file);
    return {
      imageUrl: result.secureUrl,
      imagePublicId: result.publicId,
    };
  }

  @Get()
  async findMyFeedback(
    @CurrentUser() user: { userId: string },
    @Query() query: QueryFeedbackDto
  ) {
    return this.feedbackService.findUserFeedback(user.userId, query);
  }

  // `@Roles` is only metadata — `RolesGuard` is not global, so every admin
  // route must opt in or any signed-in user can call it.
  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async findAllAdmin(@Query() query: QueryFeedbackDto) {
    return this.feedbackService.findAllAdmin(query);
  }

  @Get('admin/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async findOneAdmin(@Param('id') id: string) {
    return this.feedbackService.findOneAdmin(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto
  ) {
    return this.feedbackService.updateStatus(id, dto);
  }
}
