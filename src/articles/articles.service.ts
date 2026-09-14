import { Injectable, NotFoundException } from '@nestjs/common';
import { ArticleStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ARTICLE_DETAIL_SELECT,
  ARTICLE_LIST_SELECT,
} from './article-select.constant';
import { QueryArticlesDto } from './dto/query-articles.dto';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const RELATED_LIMIT = 3;

/**
 * Read side of the editorial articles feature: everything a public visitor can
 * reach. Admin writes live in ArticlesAdminService.
 */
@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublished(query: QueryArticlesDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const where = this.buildPublishedWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        select: ARTICLE_LIST_SELECT,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
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

  /**
   * Full article by slug, plus the slugs of its translations so the page can
   * emit hreflang alternates.
   */
  async findBySlug(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: { slug, ...this.publishedFilter() },
      select: ARTICLE_DETAIL_SELECT,
    });

    if (!article) throw new NotFoundException('Article not found');

    const translations = article.translationGroupId
      ? await this.prisma.article.findMany({
          where: {
            translationGroupId: article.translationGroupId,
            ...this.publishedFilter(),
          },
          select: { locale: true, slug: true },
        })
      : [{ locale: article.locale, slug: article.slug }];

    return { ...article, translations };
  }

  /**
   * Articles shown under the one being read: same category first, falling back
   * to the newest in the same locale when the category is thin.
   */
  async findRelated(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: { slug, ...this.publishedFilter() },
      select: { id: true, locale: true, category: true },
    });

    if (!article) throw new NotFoundException('Article not found');

    const sameCategory = await this.prisma.article.findMany({
      where: {
        ...this.publishedFilter(),
        locale: article.locale,
        category: article.category,
        id: { not: article.id },
      },
      select: ARTICLE_LIST_SELECT,
      orderBy: [{ publishedAt: 'desc' }],
      take: RELATED_LIMIT,
    });

    if (sameCategory.length >= RELATED_LIMIT) return sameCategory;

    const excludedIds = [article.id, ...sameCategory.map((item) => item.id)];
    const fillers = await this.prisma.article.findMany({
      where: {
        ...this.publishedFilter(),
        locale: article.locale,
        id: { notIn: excludedIds },
      },
      select: ARTICLE_LIST_SELECT,
      orderBy: [{ publishedAt: 'desc' }],
      take: RELATED_LIMIT - sameCategory.length,
    });

    return [...sameCategory, ...fillers];
  }

  /** Published article count per category, for the list page filter chips. */
  async countByCategory(locale?: string) {
    const grouped = await this.prisma.article.groupBy({
      by: ['category'],
      where: { ...this.publishedFilter(), ...(locale ? { locale } : {}) },
      _count: { _all: true },
    });

    return grouped.map((row) => ({
      category: row.category,
      count: row._count._all,
    }));
  }

  /** Minimal payload the frontend build uses for sitemap + generateStaticParams. */
  async findForSitemap() {
    return this.prisma.article.findMany({
      where: this.publishedFilter(),
      select: {
        slug: true,
        locale: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 1000,
    });
  }

  /**
   * Called from the client after the article renders. The page itself is
   * statically cached by ISR, so the counter cannot live in the page fetch.
   */
  async trackView(slug: string) {
    const article = await this.prisma.article.findFirst({
      where: { slug, ...this.publishedFilter() },
      select: { id: true },
    });

    if (!article) throw new NotFoundException('Article not found');

    const updated = await this.prisma.article.update({
      where: { id: article.id },
      data: { viewCount: { increment: 1 } },
      select: { viewCount: true },
    });

    return updated;
  }

  /**
   * Scheduled posts (publishedAt in the future) stay hidden until their time
   * arrives, so the filter is always evaluated against "now".
   */
  private publishedFilter(): Prisma.ArticleWhereInput {
    return {
      status: ArticleStatus.PUBLISHED,
      publishedAt: { not: null, lte: new Date() },
    };
  }

  private buildPublishedWhere(
    query: QueryArticlesDto
  ): Prisma.ArticleWhereInput {
    const search = query.search?.trim();

    return {
      ...this.publishedFilter(),
      ...(query.locale ? { locale: query.locale } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
      ...(query.featured !== undefined ? { isFeatured: query.featured } : {}),
      ...(query.excludeSlug ? { slug: { not: query.excludeSlug } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { excerpt: { contains: search, mode: 'insensitive' } },
              { tags: { has: search.toLowerCase() } },
            ],
          }
        : {}),
    };
  }
}
