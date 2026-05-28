import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService
  ) {}

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

  async findAll(page = 1, limit = 10, userId?: string) {
    const skip = (page - 1) * limit;
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        where: { originalPostId: null },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          images: { orderBy: { order: 'asc' } },
          _count: {
            select: { likes: true, comments: true, shares: true },
          },
          likes: userId ? { where: { userId } } : false,
        },
      }),
      this.prisma.post.count({ where: { originalPostId: null } }),
    ]);

    return {
      posts: posts.map((post) => this.normalizePost(post, userId)),
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
      return { liked: false, likeCount };
    } else {
      // Like
      await this.prisma.postLike.create({
        data: { postId, userId },
      });
      const likeCount = await this.prisma.postLike.count({
        where: { postId },
      });
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

    return this.prisma.postComment.create({
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
