import { Prisma } from '@prisma/client';

const AUTHOR_SELECT = {
  id: true,
  name: true,
  image: true,
} satisfies Prisma.UserSelect;

/**
 * List/card payload. Deliberately omits `content`, which is by far the largest
 * column — a 20-item feed would otherwise ship several hundred KB of HTML.
 */
export const ARTICLE_LIST_SELECT = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  excerpt: true,
  coverImage: true,
  category: true,
  tags: true,
  status: true,
  isFeatured: true,
  readingTimeMinutes: true,
  viewCount: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: AUTHOR_SELECT },
} satisfies Prisma.ArticleSelect;

/** Detail payload: the list fields plus the article body. */
export const ARTICLE_DETAIL_SELECT = {
  ...ARTICLE_LIST_SELECT,
  content: true,
  translationGroupId: true,
  createdAt: true,
} satisfies Prisma.ArticleSelect;

/** Admin payload: everything an editor needs to round-trip the form. */
export const ARTICLE_ADMIN_SELECT = {
  ...ARTICLE_DETAIL_SELECT,
  coverImagePublicId: true,
  authorId: true,
} satisfies Prisma.ArticleSelect;

export type ArticleListItem = Prisma.ArticleGetPayload<{
  select: typeof ARTICLE_LIST_SELECT;
}>;
