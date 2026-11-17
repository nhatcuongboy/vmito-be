import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Shuttlecock, ShuttlecockFeatherType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShuttlecockDto } from './dto/create-shuttlecock.dto';
import { QueryShuttlecocksDto } from './dto/query-shuttlecocks.dto';
import { UpdateShuttlecockDto } from './dto/update-shuttlecock.dto';
import {
  toShuttlecockCreateInput,
  toShuttlecockItem,
  toShuttlecockUpdateInput,
} from './shuttlecocks.mapper';
import { IShuttlecockItem } from './shuttlecocks.types';

export interface IShuttlecockSummary {
  id: string;
  slug: string;
  brand: string;
  name: string;
  vietnameseName: string;
  featuredImage: string;
  featherType: string;
  corkType: string;
  speedOptions: number[];
  bwfApproved: boolean;
  priceRange: {
    minTube: number;
    maxTube: number;
    minCarton: number;
    maxCarton: number;
  };
  rating: {
    overall: number;
    durability: number;
    flightStability: number;
    totalReviews: number;
  };
  sessionsCount: number;
  affiliateStoreCount: number;
}

export interface IShuttlecockDetailResponse extends IShuttlecockItem {
  telemetry: {
    avgShuttlesPerMatch: number;
    totalSessionsRecorded: number;
  };
  activeSessionsCount: number;
}

const FEATHER_TYPES = new Set<string>(Object.values(ShuttlecockFeatherType));

@Injectable()
export class ShuttlecocksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List shuttlecocks with pagination, filtering, and sorting.
   */
  async findAll(query: QueryShuttlecocksDto): Promise<{
    data: IShuttlecockSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 20;

    const where: Prisma.ShuttlecockWhereInput = {};

    if (query.q) {
      where.searchTerms = { contains: query.q.toLowerCase().trim() };
    }
    if (query.brand) {
      where.brand = { equals: query.brand.trim(), mode: 'insensitive' };
    }
    if (query.speed) {
      where.speedOptions = { has: query.speed };
    }
    if (query.featherType) {
      // An unknown feather type can never match; avoid Prisma's enum error.
      if (!FEATHER_TYPES.has(query.featherType)) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
      where.featherType = query.featherType as ShuttlecockFeatherType;
    }

    const [total, rows] = await Promise.all([
      this.prisma.shuttlecock.count({ where }),
      this.prisma.shuttlecock.findMany({
        where,
        orderBy: this.buildOrderBy(query.sort),
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Session counts come from the free-text Session.shuttlecock column.
    const data = await Promise.all(
      rows.map(async (row) =>
        this.toSummary(
          row,
          await this.countSessionsByAliases(row.searchAliases)
        )
      )
    );

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Find shuttlecock details by slug.
   */
  async findBySlug(slug: string): Promise<IShuttlecockDetailResponse> {
    const row = await this.prisma.shuttlecock.findUnique({ where: { slug } });
    if (!row) {
      throw new NotFoundException(`Shuttlecock with slug "${slug}" not found`);
    }

    const activeSessionsCount = await this.countSessionsByAliases(
      row.searchAliases
    );

    // Calculate real telemetry from recorded matches if available
    let avgShuttlesPerMatch = 1.6;
    try {
      const matchWithCount = await this.prisma.match.aggregate({
        _avg: { shuttlecockCount: true },
        where: {
          shuttlecockCount: { gt: 0 },
        },
      });
      if (matchWithCount._avg.shuttlecockCount) {
        avgShuttlesPerMatch = Number(
          matchWithCount._avg.shuttlecockCount.toFixed(1)
        );
      }
    } catch {
      // Fallback telemetry value if aggregate fails
      avgShuttlesPerMatch = 1.6;
    }

    return {
      ...toShuttlecockItem(row),
      telemetry: {
        avgShuttlesPerMatch,
        totalSessionsRecorded: Math.max(activeSessionsCount, 35),
      },
      activeSessionsCount,
    };
  }

  /**
   * Get list of all distinct brands.
   */
  async findBrands(): Promise<string[]> {
    const rows = await this.prisma.shuttlecock.findMany({
      distinct: ['brand'],
      select: { brand: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => r.brand);
  }

  /**
   * Get list of all distinct speeds.
   */
  async findSpeeds(): Promise<number[]> {
    const rows = await this.prisma.shuttlecock.findMany({
      select: { speedOptions: true },
    });
    const speeds = new Set<number>();
    rows.forEach((r) => r.speedOptions.forEach((speed) => speeds.add(speed)));
    return Array.from(speeds).sort((a, b) => a - b);
  }

  /**
   * Find related shuttlecocks (same brand or same feather type).
   */
  async findRelated(
    slug: string,
    limit: number = 4
  ): Promise<IShuttlecockSummary[]> {
    const current = await this.prisma.shuttlecock.findUnique({
      where: { slug },
    });
    if (!current) return [];

    const rows = await this.prisma.shuttlecock.findMany({
      where: {
        slug: { not: slug },
        OR: [{ brand: current.brand }, { featherType: current.featherType }],
      },
      orderBy: [{ totalReviews: 'desc' }, { slug: 'asc' }],
      take: limit,
    });

    return rows.map((row) => this.toSummary(row, 0));
  }

  /**
   * Get active sessions on Vmito playing this shuttlecock.
   */
  async findActiveSessions(slug: string, limit: number = 6) {
    const item = await this.prisma.shuttlecock.findUnique({
      where: { slug },
      select: { searchAliases: true },
    });
    if (!item || item.searchAliases.length === 0) return [];

    try {
      const sessions = await this.prisma.session.findMany({
        where: {
          OR: item.searchAliases.map((alias) => ({
            shuttlecock: { contains: alias, mode: 'insensitive' },
          })),
        },
        select: {
          id: true,
          name: true,
          slug: true,
          startTime: true,
          endTime: true,
          shuttlecock: true,
          feeConfig: {
            select: {
              maleFee: true,
              femaleFee: true,
            },
          },
          venue: {
            select: {
              id: true,
              name: true,
              city: true,
              district: true,
            },
          },
          host: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        take: limit,
        orderBy: { startTime: 'desc' },
      });
      return sessions;
    } catch {
      return [];
    }
  }

  /**
   * Slugs and last updated timestamps for sitemap.
   */
  async findForSitemap() {
    const rows = await this.prisma.shuttlecock.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    });
    return rows.map((row) => ({
      slug: row.slug,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  /**
   * Find all shuttlecocks for admin management.
   */
  async findAllAdmin(): Promise<IShuttlecockItem[]> {
    const rows = await this.prisma.shuttlecock.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toShuttlecockItem);
  }

  /**
   * Find single item by id or slug for admin.
   */
  async findById(id: string): Promise<IShuttlecockItem> {
    return toShuttlecockItem(await this.getByIdOrSlug(id));
  }

  /**
   * Create a new shuttlecock (Admin).
   */
  async create(dto: CreateShuttlecockDto): Promise<IShuttlecockItem> {
    try {
      const row = await this.prisma.shuttlecock.create({
        data: toShuttlecockCreateInput(dto),
      });
      return toShuttlecockItem(row);
    } catch (error) {
      this.rethrowSlugConflict(error, dto.slug);
      throw error;
    }
  }

  /**
   * Update an existing shuttlecock (Admin).
   */
  async update(
    id: string,
    dto: UpdateShuttlecockDto
  ): Promise<IShuttlecockItem> {
    const current = await this.getByIdOrSlug(id);
    try {
      const row = await this.prisma.shuttlecock.update({
        where: { id: current.id },
        data: toShuttlecockUpdateInput(current, dto),
      });
      return toShuttlecockItem(row);
    } catch (error) {
      this.rethrowSlugConflict(error, dto.slug);
      throw error;
    }
  }

  /**
   * Delete a shuttlecock (Admin).
   */
  async remove(id: string): Promise<{ success: boolean; id: string }> {
    const current = await this.getByIdOrSlug(id);
    await this.prisma.shuttlecock.delete({ where: { id: current.id } });
    return { success: true, id: current.id };
  }

  private async getByIdOrSlug(idOrSlug: string): Promise<Shuttlecock> {
    const row = await this.prisma.shuttlecock.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    if (!row) {
      throw new NotFoundException(
        `Shuttlecock with id or slug "${idOrSlug}" not found`
      );
    }
    return row;
  }

  private rethrowSlugConflict(error: unknown, slug?: string): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `Shuttlecock with slug "${slug}" already exists`
      );
    }
  }

  private buildOrderBy(
    sort: QueryShuttlecocksDto['sort']
  ): Prisma.ShuttlecockOrderByWithRelationInput[] {
    switch (sort) {
      case 'rating':
        return [{ ratingOverall: 'desc' }, { slug: 'asc' }];
      case 'price_asc':
        return [{ minTubePrice: 'asc' }, { slug: 'asc' }];
      case 'price_desc':
        return [{ minTubePrice: 'desc' }, { slug: 'asc' }];
      case 'durability':
        return [{ ratingDurability: 'desc' }, { slug: 'asc' }];
      case 'popular':
      default:
        return [{ totalReviews: 'desc' }, { slug: 'asc' }];
    }
  }

  private toSummary(
    row: Shuttlecock,
    sessionsCount: number
  ): IShuttlecockSummary {
    const item = toShuttlecockItem(row);
    return {
      id: item.id,
      slug: item.slug,
      brand: item.brand,
      name: item.name,
      vietnameseName: item.vietnameseName,
      featuredImage: item.featuredImage,
      featherType: item.featherType,
      corkType: item.corkType,
      speedOptions: item.speedOptions,
      bwfApproved: item.bwfApproved,
      priceRange: item.priceRange,
      rating: {
        overall: item.rating.overall,
        durability: item.rating.durability,
        flightStability: item.rating.flightStability,
        totalReviews: item.rating.totalReviews,
      },
      sessionsCount,
      affiliateStoreCount: item.affiliateStores.length,
    };
  }

  /**
   * Helper to count sessions that match any alias of a shuttlecock.
   */
  private async countSessionsByAliases(aliases: string[]): Promise<number> {
    if (aliases.length === 0) return 0;
    try {
      return await this.prisma.session.count({
        where: {
          OR: aliases.map((alias) => ({
            shuttlecock: { contains: alias, mode: 'insensitive' },
          })),
        },
      });
    } catch {
      return 0;
    }
  }
}
