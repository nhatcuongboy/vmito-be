import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SessionsGateway } from '../sessions/sessions.gateway';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { CreateCommentDto } from './dto/create-comment.dto';

export type PostCount = {
  likes?: number;
  comments?: number;
  shares?: number;
};

export type NormalizablePost = {
  images?: unknown;
  _count?: PostCount | null;
  likes?: unknown;
  originalPost?: NormalizablePost | null;
};

export type NormalizedPost<T extends NormalizablePost> = Omit<
  T,
  'images' | '_count' | 'originalPost' | 'likes'
> & {
  images: unknown[];
  _count: {
    likes: number;
    comments: number;
    shares: number;
  };
  originalPost: NormalizedPost<NormalizablePost> | null | undefined;
  isLiked: boolean;
  likes: undefined;
};

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionsGateway: SessionsGateway
  ) {}

  private async notifyPostInteraction(
    post: { id: string; authorId: string },
    actorId: string,
    action: 'post_liked' | 'post_commented',
    actorName: string,
    actorAvatar: string | null = null,
    extraData: Record<string, string> = {}
  ) {
    if (post.authorId === actorId) return;

    try {
      await this.notificationsService.createForUser(
        post.authorId,
        'POST',
        action,
        actorName,
        {
          postId: post.id,
          actorId,
          actorName,
          actorAvatar,
          action,
          ...extraData,
        }
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send ${action} notification for post ${post.id}: ${error}`
      );
    }
  }

  private async hasUnreadLikeNotification(
    ownerId: string,
    postId: string,
    actorId: string
  ) {
    const existing = await this.prisma.notification.findFirst({
      where: {
        userId: ownerId,
        type: 'POST',
        isRead: false,
        AND: [
          { data: { path: ['postId'], equals: postId } },
          { data: { path: ['actorId'], equals: actorId } },
          { data: { path: ['action'], equals: 'post_liked' } },
        ],
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private notifyPostLikeUpdate(
    postId: string,
    actorId: string,
    isLiked: boolean,
    likeCount: number
  ) {
    try {
      this.sessionsGateway.notifyPostLikeUpdate(postId, {
        actorId,
        isLiked,
        likeCount,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit post like update ${postId}: ${String(error)}`
      );
    }
  }

  private notifyPostCommentCreated(
    postId: string,
    comment: unknown,
    commentCount: number,
    actorId: string
  ) {
    try {
      this.sessionsGateway.notifyPostCommentCreated(postId, {
        comment,
        commentCount,
        actorId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit post comment created ${postId}: ${String(error)}`
      );
    }
  }

  private notifyPostCommentDeleted(
    postId: string,
    commentId: string,
    commentCount: number,
    actorId: string
  ) {
    try {
      this.sessionsGateway.notifyPostCommentDeleted(postId, {
        commentId,
        commentCount,
        actorId,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit post comment deleted ${postId}: ${String(error)}`
      );
    }
  }

  private normalizePost<T extends NormalizablePost>(
    post: T,
    userId?: string
  ): NormalizedPost<T> {
    const likes = Array.isArray(post.likes) ? post.likes : [];
    const count = post._count ?? {};
    const originalPost: NormalizedPost<NormalizablePost> | null | undefined =
      post.originalPost
        ? this.normalizePost(post.originalPost)
        : post.originalPost;

    return {
      ...post,
      images: Array.isArray(post.images) ? post.images : [],
      _count: {
        likes: count.likes ?? 0,
        comments: count.comments ?? 0,
        shares: count.shares ?? 0,
      },
      originalPost,
      isLiked: userId ? likes.length > 0 : false,
      likes: undefined,
    };
  }

  async create(userId: string, createPostDto: CreatePostDto) {
    const images = createPostDto.images ?? [];

    return this.prisma.post.create({
      data: {
        content: createPostDto.content,
        videoUrl: createPostDto.videoUrl,
        location: createPostDto.location,
        authorId: userId,
        images:
          images.length > 0
            ? {
                create: images.map((image, index) => ({
                  url: image.url,
                  publicId: image.publicId,
                  order: image.order ?? index,
                })),
              }
            : undefined,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        images: { orderBy: { order: 'asc' } },
        _count: {
          select: { likes: true, comments: true, shares: true },
        },
      },
    });
  }

  /**
   * Single extension point for feed scoping. When the friend system lands,
   * filter here, e.g.:
   *   { OR: [{ visibility: 'PUBLIC' }, { authorId: { in: friendIds }, visibility: 'FRIENDS' }] }
   */
  private buildFeedWhere(_viewerId?: string): Prisma.PostWhereInput {
    return { visibility: 'PUBLIC' };
  }

  async findAll(page = 1, limit = 10, userId?: string) {
    const skip = (page - 1) * limit;
    const where = this.buildFeedWhere(userId);
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where,
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          images: { orderBy: { order: 'asc' } },
          originalPost: {
            include: {
              author: {
                select: { id: true, name: true, image: true },
              },
              images: { orderBy: { order: 'asc' } },
              _count: {
                select: { likes: true, comments: true, shares: true },
              },
            },
          },
          _count: {
            select: { likes: true, comments: true, shares: true },
          },
          likes: userId ? { where: { userId } } : false,
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      posts: posts.map((post) => this.normalizePost(post, userId)),
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  /**
   * Posts authored by a specific user, for their profile page. The owner sees
   * all their posts; other viewers see only PUBLIC ones.
   */
  async findByAuthor(
    authorId: string,
    page = 1,
    limit = 10,
    viewerId?: string
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.PostWhereInput = {
      authorId,
      ...(viewerId === authorId ? {} : { visibility: 'PUBLIC' }),
    };

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where,
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          images: { orderBy: { order: 'asc' } },
          originalPost: {
            include: {
              author: {
                select: { id: true, name: true, image: true },
              },
              images: { orderBy: { order: 'asc' } },
              _count: {
                select: { likes: true, comments: true, shares: true },
              },
            },
          },
          _count: {
            select: { likes: true, comments: true, shares: true },
          },
          likes: viewerId ? { where: { userId: viewerId } } : false,
        },
      }),
      this.prisma.post.count({ where }),
    ]);

    return {
      posts: posts.map((post) => this.normalizePost(post, viewerId)),
      total,
      page,
      limit,
      hasMore: skip + posts.length < total,
    };
  }

  async findOne(id: string, userId?: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        images: { orderBy: { order: 'asc' } },
        originalPost: {
          include: {
            author: {
              select: { id: true, name: true, image: true },
            },
            images: { orderBy: { order: 'asc' } },
            _count: {
              select: { likes: true, comments: true, shares: true },
            },
          },
        },
        _count: {
          select: { likes: true, comments: true, shares: true },
        },
        likes: userId ? { where: { userId } } : false,
      },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return this.normalizePost(post, userId);
  }

  async update(id: string, userId: string, updatePostDto: UpdatePostDto) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (post.type === 'ACTIVITY') {
      throw new ForbiddenException('Activity posts cannot be edited');
    }

    return this.prisma.post.update({
      where: { id },
      data: updatePostDto,
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        images: { orderBy: { order: 'asc' } },
        _count: {
          select: { likes: true, comments: true, shares: true },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { images: true },
    });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // Delete post-only images from Cloudinary. Images selected from the user's
    // shared gallery are owned by user_images and should remain reusable.
    if (post.images.length > 0) {
      const reusableImages = await this.prisma.userImage.findMany({
        where: {
          publicId: { in: post.images.map((image) => image.publicId) },
        },
        select: { publicId: true },
      });
      const reusablePublicIds = new Set(
        reusableImages.map((image) => image.publicId)
      );

      await Promise.all(
        post.images
          .filter((img) => !reusablePublicIds.has(img.publicId))
          .map((img) =>
            this.cloudinary.deleteImage(img.publicId).catch(() => {})
          )
      );
    }

    // Deleting a repost frees the PostShare slot so the user can share again.
    if (post.originalPostId) {
      await this.prisma.postShare.deleteMany({
        where: { postId: post.originalPostId, userId: post.authorId },
      });
    }

    // Deleting an original also removes its (contentless) reposts — the
    // relation has no cascade, so they would otherwise linger in the feed
    // with originalPostId set to NULL.
    await this.prisma.post.deleteMany({ where: { originalPostId: id } });

    await this.prisma.post.delete({ where: { id } });
    return { message: 'Post deleted successfully' };
  }

  async uploadImages(
    postId: string,
    userId: string,
    files: Express.Multer.File[]
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    if (post.authorId !== userId) {
      throw new ForbiddenException(
        'You can only upload images to your own posts'
      );
    }

    const uploadPromises = files.map((file, index) =>
      this.cloudinary.uploadImage(file, 'posts').then((result) => ({
        url: result.secureUrl,
        publicId: result.publicId,
        order: index,
      }))
    );

    const uploadedImages = await Promise.all(uploadPromises);

    const images = await this.prisma.$transaction(
      uploadedImages.map((img) =>
        this.prisma.postImage.create({
          data: {
            postId,
            url: img.url,
            publicId: img.publicId,
            order: img.order,
          },
        })
      )
    );

    return { images };
  }

  async toggleLike(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const existingLike = await this.prisma.postLike.findUnique({
      where: {
        postId_userId: { postId, userId },
      },
    });

    if (existingLike) {
      // Unlike
      await this.prisma.postLike.delete({ where: { id: existingLike.id } });
      const likeCount = await this.prisma.postLike.count({
        where: { postId },
      });
      this.notifyPostLikeUpdate(postId, userId, false, likeCount);
      return { liked: false, likeCount };
    } else {
      // Like
      await this.prisma.postLike.create({
        data: { postId, userId },
      });
      const likeCount = await this.prisma.postLike.count({
        where: { postId },
      });
      this.notifyPostLikeUpdate(postId, userId, true, likeCount);

      if (post.authorId !== userId) {
        // Repeated like/unlike keeps at most one unread notification per actor
        const alreadyNotified = await this.hasUnreadLikeNotification(
          post.authorId,
          postId,
          userId
        );
        if (!alreadyNotified) {
          const actor = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, image: true },
          });
          await this.notifyPostInteraction(
            post,
            userId,
            'post_liked',
            actor?.name || '',
            actor?.image ?? null
          );
        }
      }

      return { liked: true, likeCount };
    }
  }

  async createComment(
    postId: string,
    userId: string,
    createCommentDto: CreateCommentDto
  ) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('Post not found');
    }

    const comment = await this.prisma.postComment.create({
      data: {
        postId,
        userId,
        content: createCommentDto.content,
      },
      include: {
        user: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    const commentCount = await this.prisma.postComment.count({
      where: { postId },
    });
    this.notifyPostCommentCreated(postId, comment, commentCount, userId);

    await this.notifyPostInteraction(
      post,
      userId,
      'post_commented',
      comment.user.name || '',
      comment.user.image,
      { commentId: comment.id }
    );

    return comment;
  }

  async getComments(postId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [comments, total] = await Promise.all([
      this.prisma.postComment.findMany({
        where: { postId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
        },
      }),
      this.prisma.postComment.count({ where: { postId } }),
    ]);

    return {
      comments,
      total,
      page,
      limit,
      hasMore: skip + comments.length < total,
    };
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    // Delete image from Cloudinary if exists
    if (comment.imagePublicId) {
      await this.cloudinary.deleteImage(comment.imagePublicId).catch(() => {});
    }

    await this.prisma.postComment.delete({ where: { id: commentId } });
    const commentCount = await this.prisma.postComment.count({
      where: { postId: comment.postId },
    });
    this.notifyPostCommentDeleted(
      comment.postId,
      commentId,
      commentCount,
      userId
    );
    return { message: 'Comment deleted successfully' };
  }

  async sharePost(postId: string, userId: string) {
    const originalPost = await this.prisma.post.findUnique({
      where: { id: postId },
    });
    if (!originalPost) {
      throw new NotFoundException('Post not found');
    }

    // Check if user already shared this post
    const existingShare = await this.prisma.postShare.findUnique({
      where: {
        postId_userId: { postId, userId },
      },
    });

    if (existingShare) {
      throw new BadRequestException('You have already shared this post');
    }

    // Create share record
    await this.prisma.postShare.create({
      data: { postId, userId },
    });

    // Create new post as repost
    const sharedPost = await this.prisma.post.create({
      data: {
        content: '', // Empty content for pure repost
        authorId: userId,
        originalPostId: postId,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        images: { orderBy: { order: 'asc' } },
        originalPost: {
          include: {
            author: {
              select: { id: true, name: true, image: true },
            },
            images: { orderBy: { order: 'asc' } },
            _count: {
              select: { likes: true, comments: true, shares: true },
            },
          },
        },
        _count: {
          select: { likes: true, comments: true, shares: true },
        },
      },
    });

    return this.normalizePost(sharedPost, userId);
  }
}
