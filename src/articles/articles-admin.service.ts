import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ARTICLE_ADMIN_SELECT } from './article-select.constant';
import { CreateArticleDto } from './dto/create-article.dto';
import { QueryAdminArticlesDto } from './dto/query-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { buildUniqueSlug } from './utils/article-slug.util';
import { estimateReadingTimeMinutes } from './utils/reading-time.util';

const DEFAULT_ADMIN_LIMIT = 20;

/** Write side of the articles feature. Admin-only; guarded at the controller. */
@Injectable()
export class ArticlesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService
  ) {}

  async findAll(query: QueryAdminArticlesDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_ADMIN_LIMIT;
    const search = query.search?.trim();

    const where: Prisma.ArticleWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        select: ARTICLE_ADMIN_SELECT,
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async findOne(id: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      select: ARTICLE_ADMIN_SELECT,
    });

    if (!article) throw new NotFoundException('Article not found');
    return article;
  }

  async create(dto: CreateArticleDto, authorId?: string) {
    const slug = await this.resolveSlug(dto.slug ?? dto.title, dto.slug);
    const status = dto.status ?? ArticleStatus.DRAFT;

    return this.prisma.article.create({
      data: {
        slug,
        locale: dto.locale,
        translationGroupId: dto.translationGroupId ?? null,
        title: dto.title,
        excerpt: dto.excerpt,
        content: dto.content,
        coverImage: dto.coverImage ?? null,
        coverImagePublicId: dto.coverImagePublicId ?? null,
        category: dto.category,
        tags: this.normalizeTags(dto.tags),
        status,
        isFeatured: dto.isFeatured ?? false,
        readingTimeMinutes:
          dto.readingTimeMinutes ?? estimateReadingTimeMinutes(dto.content),
        publishedAt: this.resolvePublishedAt(status, dto.publishedAt, null),
        authorId: authorId ?? null,
      },
      select: ARTICLE_ADMIN_SELECT,
    });
  }

  async update(id: string, dto: UpdateArticleDto) {
    const existing = await this.findOne(id);

    const slug =
      dto.slug !== undefined && dto.slug !== existing.slug
        ? await this.resolveSlug(dto.slug, dto.slug, id)
        : undefined;

    const status = dto.status ?? existing.status;
    const content = dto.content ?? existing.content;

    // Replacing or clearing the cover image leaves the old Cloudinary asset
    // orphaned otherwise.
    const isCoverChanged =
      dto.coverImagePublicId !== undefined &&
      dto.coverImagePublicId !== existing.coverImagePublicId;
    if (isCoverChanged && existing.coverImagePublicId) {
      await this.cloudinary.deleteImage(existing.coverImagePublicId);
    }

    return this.prisma.article.update({
      where: { id },
      data: {
        ...(slug !== undefined && { slug }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(dto.translationGroupId !== undefined && {
          translationGroupId: dto.translationGroupId || null,
        }),
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.excerpt !== undefined && { excerpt: dto.excerpt }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.coverImage !== undefined && {
          coverImage: dto.coverImage || null,
        }),
        ...(dto.coverImagePublicId !== undefined && {
          coverImagePublicId: dto.coverImagePublicId || null,
        }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...(dto.tags !== undefined && { tags: this.normalizeTags(dto.tags) }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.isFeatured !== undefined && { isFeatured: dto.isFeatured }),
        // Recompute unless the editor pinned an explicit value.
        ...(dto.readingTimeMinutes !== undefined
          ? { readingTimeMinutes: dto.readingTimeMinutes }
          : dto.content !== undefined
            ? { readingTimeMinutes: estimateReadingTimeMinutes(content) }
            : {}),
        publishedAt: this.resolvePublishedAt(
          status,
          dto.publishedAt,
          existing.publishedAt
        ),
      },
      select: ARTICLE_ADMIN_SELECT,
    });
  }

  async remove(id: string) {
    const existing = await this.findOne(id);

    if (existing.coverImagePublicId) {
      await this.cloudinary.deleteImage(existing.coverImagePublicId);
    }

    await this.prisma.article.delete({ where: { id } });
    return { success: true };
  }

  async uploadCover(file: Express.Multer.File) {
    const result = await this.cloudinary.uploadImage(file, 'article-covers', {
      transformation: [{ width: 1600, crop: 'limit' }],
      quality: 'auto:good',
    });
    return { url: result.secureUrl, publicId: result.publicId };
  }

  /**
   * `publishedAt` is the timestamp the article went live. It is stamped once,
   * on the first transition to PUBLISHED, and preserved afterwards so editing a
   * live article never reshuffles the feed. An explicit value always wins,
   * which is what lets an editor backdate or schedule a post.
   */
  private resolvePublishedAt(
    status: ArticleStatus,
    explicit: string | undefined,
    current: Date | null
  ): Date | null {
    if (explicit) return new Date(explicit);
    if (status !== ArticleStatus.PUBLISHED) return current;
    return current ?? new Date();
  }

  /**
   * Tags are matched with an exact `has` filter, so they have to be normalized
   * on write or "Cầu Lông" and "cầu lông" become two different tags.
   */
  private normalizeTags(tags?: string[]): string[] {
    if (!tags) return [];
    const normalized = tags
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set(normalized));
  }

  /**
   * An explicitly supplied slug must be honoured exactly — silently suffixing
   * it would break links the editor expects — so a collision is an error.
   * A derived slug is free to pick the next free variant.
   */
  private async resolveSlug(
    source: string,
    explicit: string | undefined,
    ignoreId?: string
  ): Promise<string> {
    const isTaken = async (candidate: string) => {
      const found = await this.prisma.article.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return found !== null && found.id !== ignoreId;
    };

    if (explicit) {
      if (await isTaken(explicit)) {
        throw new ConflictException(`Slug "${explicit}" is already in use`);
      }
      return explicit;
    }

    return buildUniqueSlug(source, isTaken);
  }
}
