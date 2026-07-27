import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { PostsService } from './posts.service';
import { ActivityFeedService } from '../activities/activity-feed.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ShareSessionResultsDto } from './dto/share-session-results.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { Public } from '../auth/decorators/public.decorator';

interface AuthenticatedRequest {
  user: {
    userId: string;
    role: string;
    name?: string;
  };
}

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
    private readonly activityFeedService: ActivityFeedService
  ) {}

  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Body() createPostDto: CreatePostDto
  ) {
    return this.postsService.create(req.user.userId, createPostDto);
  }

  // Declared before the ':id' routes so 'session-results' is not matched as an id.
  @Post('session-results')
  shareSessionResults(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ShareSessionResultsDto
  ) {
    return this.activityFeedService.shareSessionResults(
      req.user.userId,
      dto.sessionId
    );
  }

  @Get('feed')
  getFeed(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest
  ) {
    return this.postsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      req?.user?.userId
    );
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest
  ) {
    return this.postsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      req?.user?.userId
    );
  }

  // Declared before ':id' so 'user' is not matched as a post id.
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Get('user/:userId')
  findByAuthor(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Request() req?: AuthenticatedRequest
  ) {
    return this.postsService.findByAuthor(
      userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      req?.user?.userId
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req?: AuthenticatedRequest) {
    return this.postsService.findOne(id, req?.user?.userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() updatePostDto: UpdatePostDto
  ) {
    return this.postsService.update(id, req.user.userId, updatePostDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.postsService.remove(id, req.user.userId);
  }

  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('images', 10))
  uploadImages(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @UploadedFiles() files: Express.Multer.File[]
  ) {
    return this.postsService.uploadImages(id, req.user.userId, files);
  }

  @Post(':id/like')
  toggleLike(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.postsService.toggleLike(id, req.user.userId);
  }

  @Post(':id/comments')
  createComment(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
    @Body() createCommentDto: CreateCommentDto
  ) {
    return this.postsService.createComment(
      id,
      req.user.userId,
      createCommentDto
    );
  }

  @Get(':id/comments')
  getComments(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    return this.postsService.getComments(
      id,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20
    );
  }

  @Delete('comments/:commentId')
  deleteComment(
    @Param('commentId') commentId: string,
    @Request() req: AuthenticatedRequest
  ) {
    return this.postsService.deleteComment(commentId, req.user.userId);
  }

  @Post(':id/share')
  sharePost(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.postsService.sharePost(id, req.user.userId);
  }
}
