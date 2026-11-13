import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryShuttlecocksDto } from './dto/query-shuttlecocks.dto';
import { CreateShuttlecockDto } from './dto/create-shuttlecock.dto';
import { UpdateShuttlecockDto } from './dto/update-shuttlecock.dto';
import { IShuttlecockItem, SEED_SHUTTLECOCKS } from './shuttlecocks.data';

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

@Injectable()
export class ShuttlecocksService {
  private items: IShuttlecockItem[] = [...SEED_SHUTTLECOCKS];

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
    let list = [...this.items];

    // Filter by text search query
    if (query.q) {
      const qLower = query.q.toLowerCase().trim();
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(qLower) ||
          item.brand.toLowerCase().includes(qLower) ||
          item.searchAliases.some((alias) => alias.toLowerCase().includes(qLower)),
      );
    }

    // Filter by Brand
    if (query.brand) {
      const brandLower = query.brand.toLowerCase().trim();
      list = list.filter((item) => item.brand.toLowerCase() === brandLower);
    }

    // Filter by Speed
    if (query.speed) {
      list = list.filter((item) => item.speedOptions.includes(query.speed!));
    }

    // Filter by Feather Type
    if (query.featherType) {
      list = list.filter((item) => item.featherType === query.featherType);
    }

    // Sorting
    switch (query.sort) {
      case 'rating':
        list.sort((a, b) => b.rating.overall - a.rating.overall);
        break;
      case 'price_asc':
        list.sort((a, b) => a.priceRange.minTube - b.priceRange.minTube);
        break;
      case 'price_desc':
        list.sort((a, b) => b.priceRange.minTube - a.priceRange.minTube);
        break;
      case 'durability':
        list.sort((a, b) => b.rating.durability - a.rating.durability);
        break;
      case 'popular':
      default:
        list.sort((a, b) => b.rating.totalReviews - a.rating.totalReviews);
        break;
    }

    const total = list.length;
    const startIndex = (page - 1) * limit;
    const paginated = list.slice(startIndex, startIndex + limit);

    // Fetch session counts concurrently from database
    const summaries: IShuttlecockSummary[] = await Promise.all(
      paginated.map(async (item) => {
        const sessionsCount = await this.countSessionsByAliases(item.searchAliases);
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
      }),
    );

    return {
      data: summaries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find shuttlecock details by slug.
   */
  async findBySlug(slug: string): Promise<IShuttlecockDetailResponse> {
    const item = this.items.find((s) => s.slug === slug);
    if (!item) {
      throw new NotFoundException(`Shuttlecock with slug "${slug}" not found`);
    }

    const activeSessionsCount = await this.countSessionsByAliases(item.searchAliases);

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
        avgShuttlesPerMatch = Number(matchWithCount._avg.shuttlecockCount.toFixed(1));
      }
    } catch {
      // Fallback telemetry value if aggregate fails
      avgShuttlesPerMatch = 1.6;
    }

    return {
      ...item,
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
  findBrands(): string[] {
    const brands = new Set(this.items.map((s) => s.brand));
    return Array.from(brands);
  }

  /**
   * Get list of all distinct speeds.
   */
  findSpeeds(): number[] {
    const speeds = new Set<number>();
    this.items.forEach((s) => s.speedOptions.forEach((speed) => speeds.add(speed)));
    return Array.from(speeds).sort((a, b) => a - b);
  }

  /**
   * Find related shuttlecocks.
   */
  findRelated(slug: string, limit: number = 4): IShuttlecockSummary[] {
    const current = this.items.find((s) => s.slug === slug);
    if (!current) return [];

    const candidates = this.items.filter(
      (s) => s.slug !== slug && (s.brand === current.brand || s.featherType === current.featherType),
    );

    return candidates.slice(0, limit).map((item) => ({
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
      sessionsCount: 0,
      affiliateStoreCount: item.affiliateStores.length,
    }));
  }

  /**
   * Get active sessions on Vmito playing this shuttlecock.
   */
  async findActiveSessions(slug: string, limit: number = 6) {
    const item = this.items.find((s) => s.slug === slug);
    if (!item) return [];

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
  findForSitemap() {
    return this.items.map((item) => ({
      slug: item.slug,
      updatedAt: new Date().toISOString(),
    }));
  }

  /**
   * Find all shuttlecocks for admin management.
   */
  findAllAdmin(): IShuttlecockItem[] {
    return this.items;
  }

  /**
   * Find single item by id or slug for admin.
   */
  findById(id: string): IShuttlecockItem {
    const item = this.items.find((s) => s.id === id || s.slug === id);
    if (!item) {
      throw new NotFoundException(`Shuttlecock with id or slug "${id}" not found`);
    }
    return item;
  }

  /**
   * Create a new shuttlecock (Admin).
   */
  create(dto: CreateShuttlecockDto): IShuttlecockItem {
    const slugExists = this.items.some((s) => s.slug === dto.slug);
    if (slugExists) {
      throw new ConflictException(`Shuttlecock with slug "${dto.slug}" already exists`);
    }

    const newItem: IShuttlecockItem = {
      id: `sc-${Date.now()}`,
      slug: dto.slug,
      brand: dto.brand,
      name: dto.name,
      vietnameseName: dto.vietnameseName,
      featuredImage: dto.featuredImage,
      galleryImages: dto.galleryImages || [dto.featuredImage],
      featherType: dto.featherType,
      featherCount: dto.featherCount || 16,
      corkType: dto.corkType,
      speedOptions: dto.speedOptions,
      bwfApproved: dto.bwfApproved || false,
      suitability: dto.suitability,
      priceRange: {
        minTube: dto.priceRange.minTube,
        maxTube: dto.priceRange.maxTube,
        minCarton: dto.priceRange.minCarton || dto.priceRange.minTube * 48,
        maxCarton: dto.priceRange.maxCarton || dto.priceRange.maxTube * 50,
      },
      rating: {
        overall: dto.rating?.overall ?? 4.5,
        flightStability: dto.rating?.flightStability ?? 4.5,
        durability: dto.rating?.durability ?? 4.5,
        feelAndImpact: dto.rating?.feelAndImpact ?? 4.5,
        totalReviews: dto.rating?.totalReviews ?? 1,
      },
      pros: dto.pros || [],
      cons: dto.cons || [],
      description: dto.description,
      searchAliases: dto.searchAliases || [dto.name.toLowerCase()],
      affiliateStores: (dto.affiliateStores as any) || [],
    };

    this.items.unshift(newItem);
    return newItem;
  }

  /**
   * Update an existing shuttlecock (Admin).
   */
  update(id: string, dto: UpdateShuttlecockDto): IShuttlecockItem {
    const index = this.items.findIndex((s) => s.id === id || s.slug === id);
    if (index === -1) {
      throw new NotFoundException(`Shuttlecock with id or slug "${id}" not found`);
    }

    const current = this.items[index];
    const updated: IShuttlecockItem = {
      ...current,
      ...dto,
      priceRange: dto.priceRange
        ? {
            ...current.priceRange,
            ...dto.priceRange,
          }
        : current.priceRange,
      rating: dto.rating
        ? {
            ...current.rating,
            ...dto.rating,
          }
        : current.rating,
      affiliateStores: (dto.affiliateStores as any) || current.affiliateStores,
    };

    this.items[index] = updated;
    return updated;
  }

  /**
   * Delete a shuttlecock (Admin).
   */
  remove(id: string): { success: boolean; id: string } {
    const index = this.items.findIndex((s) => s.id === id || s.slug === id);
    if (index === -1) {
      throw new NotFoundException(`Shuttlecock with id or slug "${id}" not found`);
    }

    const removed = this.items.splice(index, 1)[0];
    return { success: true, id: removed.id };
  }

  /**
   * Helper to count sessions that match any alias of a shuttlecock.
   */
  private async countSessionsByAliases(aliases: string[]): Promise<number> {
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
