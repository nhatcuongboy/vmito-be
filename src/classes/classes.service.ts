import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClassStatus,
  ClassTuitionPeriod,
  FavoriteType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FavoritesService } from '../favorites/favorites.service';
import { VALID_LEVELS } from '../common/constants/level.constants';
import {
  generateSlug,
  removeVietnameseTones,
} from '../common/utils/string.utils';
import { BrowseClassesDto } from './dto/browse-classes.dto';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly favorites: FavoritesService
  ) {}

  private readonly publicInclude = {
    host: { select: { id: true, name: true, image: true } },
    venue: {
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        district: true,
        city: true,
        newAddress: true,
        newDistrict: true,
        newCity: true,
      },
    },
    schedules: {
      where: { isActive: true },
      orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }],
    },
  } satisfies Prisma.ClassInclude;

  private validateInput(dto: Partial<CreateClassDto>) {
    if (dto.schedules) {
      if (dto.schedules.length === 0)
        throw new BadRequestException(
          'At least one class schedule is required'
        );
      for (const schedule of dto.schedules) {
        if (
          !timePattern.test(schedule.startTime) ||
          !timePattern.test(schedule.endTime) ||
          schedule.startTime >= schedule.endTime
        ) {
          throw new BadRequestException(
            'Each schedule must have a valid start time before its end time'
          );
        }
      }
    }
    if (
      dto.startDate &&
      dto.endDate &&
      new Date(dto.startDate) > new Date(dto.endDate)
    ) {
      throw new BadRequestException('endDate must be on or after startDate');
    }
    if (dto.requiredLevels?.some((level) => !VALID_LEVELS.includes(level))) {
      throw new BadRequestException(
        `Invalid level values. Valid levels are: ${VALID_LEVELS.join(', ')}`
      );
    }
    if (
      dto.tuitionPeriod &&
      dto.tuitionPeriod !== ClassTuitionPeriod.CONTACT &&
      dto.tuitionAmount === undefined
    ) {
      throw new BadRequestException(
        'tuitionAmount is required unless tuitionPeriod is CONTACT'
      );
    }
    if (
      dto.tuitionPeriod === ClassTuitionPeriod.CONTACT &&
      dto.tuitionAmount !== undefined
    ) {
      throw new BadRequestException(
        'tuitionAmount must be omitted when tuitionPeriod is CONTACT'
      );
    }
    if (dto.venueId && dto.customLocation)
      throw new BadRequestException(
        'Choose a venue or custom location, not both'
      );
  }

  private async locationData(dto: Partial<CreateClassDto>) {
    if (dto.venueId) {
      const venue = await this.prisma.venue.findUnique({
        where: { id: dto.venueId },
        select: { id: true, name: true, address: true },
      });
      if (!venue) throw new NotFoundException('Venue not found');
      return {
        venueId: venue.id,
        locationText: `${venue.name} ${venue.address}`,
        customLocationName: null,
        customLocationAddress: null,
        customLocationPlaceId: null,
        customLocationLat: null,
        customLocationLng: null,
        customLocationDistrict: null,
        customLocationCity: null,
      };
    }
    if (dto.customLocation) {
      const location = dto.customLocation;
      return {
        venueId: null,
        locationText: `${location.name} ${location.address ?? ''}`,
        customLocationName: location.name.trim(),
        customLocationAddress: location.address?.trim() || null,
        customLocationPlaceId: location.placeId?.trim() || null,
        customLocationLat: location.lat ?? null,
        customLocationLng: location.lng ?? null,
        customLocationDistrict: location.district?.trim() || null,
        customLocationCity: location.city?.trim() || null,
      };
    }
    return undefined;
  }

  private async uniqueSlug(name: string, excludeId?: string) {
    const base = generateSlug(name) || 'lop-hoc';
    let slug = base;
    let sequence = 2;
    while (
      await this.prisma.class.findFirst({
        where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
        select: { id: true },
      })
    ) {
      slug = `${base}-${sequence++}`;
    }
    return slug;
  }

  private assertOwner(item: { hostId: string }, userId: string, role: string) {
    if (role !== 'ADMIN' && item.hostId !== userId)
      throw new ForbiddenException('You can only manage your own classes');
  }

  async create(dto: CreateClassDto, userId: string) {
    this.validateInput(dto);
    const [user, location] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      }),
      this.locationData(dto),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!location)
      throw new BadRequestException('A venue or custom location is required');
    const slug = await this.uniqueSlug(dto.name);
    const searchTerms = removeVietnameseTones(
      `${dto.name} ${dto.description ?? ''} ${location.locationText} ${dto.contactName ?? user.name}`
    ).toLowerCase();
    const tuitionPeriod = dto.tuitionPeriod ?? ClassTuitionPeriod.CONTACT;
    if (
      tuitionPeriod === ClassTuitionPeriod.CONTACT &&
      dto.tuitionAmount !== undefined
    ) {
      throw new BadRequestException(
        'tuitionAmount must be omitted when tuitionPeriod is CONTACT'
      );
    }
    return this.prisma.class.create({
      data: {
        slug,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        contactName: dto.contactName?.trim() || user.name,
        contactPhone: dto.contactPhone.trim(),
        zaloUrl: dto.zaloUrl?.trim() || null,
        hostId: userId,
        sportType: dto.sportType,
        requiredLevels: dto.requiredLevels ?? [],
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        capacity: dto.capacity ?? null,
        tuitionPeriod,
        tuitionAmount:
          tuitionPeriod === ClassTuitionPeriod.CONTACT
            ? null
            : (dto.tuitionAmount ?? null),
        tuitionNotes: dto.tuitionNotes?.trim() || null,
        ...location,
        searchTerms,
        coverPhoto: dto.coverPhoto ?? null,
        coverPhotoPublicId: dto.coverPhotoPublicId ?? null,
        images: dto.images ?? [],
        imagePublicIds: dto.imagePublicIds ?? [],
        schedules: {
          create: dto.schedules.map((schedule) => ({
            ...schedule,
            isActive: schedule.isActive ?? true,
          })),
        },
      },
      include: this.publicInclude,
    });
  }

  async browse(query: BrowseClassesDto, userId?: string) {
    const page = query.page ?? 1,
      limit = query.limit ?? 12,
      skip = (page - 1) * limit;
    const and: Prisma.ClassWhereInput[] = [{ status: ClassStatus.PUBLISHED }];
    if (query.favoriteOnly) {
      const ids = userId
        ? await this.favorites.getFavoritedTargetIds(userId, FavoriteType.CLASS)
        : [];
      if (!ids.length)
        return { items: [], total: 0, page, limit, totalPages: 0 };
      and.push({ id: { in: ids } });
    }
    if (query.search) {
      const term = removeVietnameseTones(query.search).toLowerCase();
      and.push({
        OR: [
          { searchTerms: { contains: term, mode: 'insensitive' } },
          { name: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.sportType) and.push({ sportType: query.sportType });
    if (query.level) {
      const levels = query.level
        .split(',')
        .map(Number)
        .filter(Number.isInteger);
      if (levels.length) and.push({ requiredLevels: { hasSome: levels } });
    }
    if (query.city)
      and.push({
        OR: [
          { venue: { city: { contains: query.city, mode: 'insensitive' } } },
          { customLocationCity: { contains: query.city, mode: 'insensitive' } },
        ],
      });
    if (query.district)
      and.push({
        OR: [
          {
            venue: {
              district: { contains: query.district, mode: 'insensitive' },
            },
          },
          {
            venue: {
              newDistrict: { contains: query.district, mode: 'insensitive' },
            },
          },
          {
            customLocationDistrict: {
              contains: query.district,
              mode: 'insensitive',
            },
          },
        ],
      });
    if (query.dayOfWeek !== undefined || query.timeFrom || query.timeTo)
      and.push({
        schedules: {
          some: {
            isActive: true,
            ...(query.dayOfWeek !== undefined
              ? { dayOfWeek: query.dayOfWeek }
              : {}),
            ...(query.timeFrom ? { startTime: { gte: query.timeFrom } } : {}),
            ...(query.timeTo ? { endTime: { lte: query.timeTo } } : {}),
          },
        },
      });
    if (query.minTuition !== undefined || query.maxTuition !== undefined)
      and.push({
        tuitionAmount: {
          ...(query.minTuition !== undefined ? { gte: query.minTuition } : {}),
          ...(query.maxTuition !== undefined ? { lte: query.maxTuition } : {}),
        },
      });
    const where: Prisma.ClassWhereInput = { AND: and };
    const distanceSort =
      query.sortBy === 'distance' &&
      query.lat !== undefined &&
      query.lng !== undefined;
    const [items, total] = await Promise.all([
      this.prisma.class.findMany({
        where,
        include: this.publicInclude,
        orderBy: { createdAt: 'desc' },
        ...(distanceSort ? {} : { skip, take: limit }),
      }),
      this.prisma.class.count({ where }),
    ]);
    const withDistance = items.map((item) => ({
      ...item,
      distance: this.distance(
        query.lat,
        query.lng,
        item.venue?.lat ?? item.customLocationLat,
        item.venue?.lng ?? item.customLocationLng
      ),
    }));
    if (distanceSort)
      withDistance.sort(
        (a, b) =>
          (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE) ||
          b.createdAt.getTime() - a.createdAt.getTime()
      );
    const result = distanceSort
      ? withDistance.slice(skip, skip + limit)
      : withDistance;
    const favorites = userId
      ? await this.favorites.isFavoritedMap(
          userId,
          FavoriteType.CLASS,
          result.map((item) => item.id)
        )
      : new Set<string>();
    return {
      items: result.map((item) => ({
        ...item,
        isFavorite: favorites.has(item.id),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async mine(userId: string, role: string) {
    return this.prisma.class.findMany({
      where: role === 'ADMIN' ? {} : { hostId: userId },
      include: this.publicInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Minimal public payload consumed by the frontend-generated sitemap. */
  async sitemap() {
    return this.prisma.class.findMany({
      where: { status: { in: [ClassStatus.PUBLISHED, ClassStatus.CLOSED] } },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
  }

  async findOne(identifier: string, viewer?: { userId: string; role: string }) {
    const item = await this.prisma.class.findFirst({
      where: { OR: [{ id: identifier }, { slug: identifier }] },
      include: this.publicInclude,
    });
    if (!item) throw new NotFoundException('Class not found');
    const isOwner =
      viewer && (viewer.role === 'ADMIN' || viewer.userId === item.hostId);
    if (
      !isOwner &&
      item.status !== ClassStatus.PUBLISHED &&
      item.status !== ClassStatus.CLOSED
    )
      throw new NotFoundException('Class not found');
    const isFavorite = viewer
      ? (
          await this.favorites.isFavoritedMap(
            viewer.userId,
            FavoriteType.CLASS,
            [item.id]
          )
        ).has(item.id)
      : false;
    return { ...item, isFavorite };
  }

  async update(id: string, dto: UpdateClassDto, userId: string, role: string) {
    const current = await this.prisma.class.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Class not found');
    this.assertOwner(current, userId, role);
    this.validateInput(dto);
    const location =
      dto.venueId !== undefined || dto.customLocation !== undefined
        ? await this.locationData(dto)
        : undefined;
    if (location === undefined && dto.venueId === null)
      throw new BadRequestException('A venue or custom location is required');
    const name = dto.name?.trim() ?? current.name;
    const searchLocation =
      location?.locationText ??
      `${current.customLocationName ?? ''} ${current.customLocationAddress ?? ''}`;
    const searchTerms = removeVietnameseTones(
      `${name} ${dto.description ?? current.description ?? ''} ${searchLocation} ${dto.contactName ?? current.contactName}`
    ).toLowerCase();
    const effectiveTuitionPeriod = dto.tuitionPeriod ?? current.tuitionPeriod;
    const effectiveTuitionAmount =
      dto.tuitionAmount !== undefined
        ? dto.tuitionAmount
        : current.tuitionAmount;
    if (
      effectiveTuitionPeriod !== ClassTuitionPeriod.CONTACT &&
      effectiveTuitionAmount === null
    ) {
      throw new BadRequestException(
        'tuitionAmount is required unless tuitionPeriod is CONTACT'
      );
    }
    return this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.name !== undefined
          ? { name, slug: await this.uniqueSlug(name, id) }
          : {}),
        ...(dto.sportType !== undefined ? { sportType: dto.sportType } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.contactName !== undefined
          ? { contactName: dto.contactName?.trim() || current.contactName }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: dto.contactPhone.trim() }
          : {}),
        ...(dto.zaloUrl !== undefined
          ? { zaloUrl: dto.zaloUrl?.trim() || null }
          : {}),
        ...(dto.requiredLevels !== undefined
          ? { requiredLevels: dto.requiredLevels }
          : {}),
        ...(dto.startDate !== undefined
          ? { startDate: dto.startDate ? new Date(dto.startDate) : null }
          : {}),
        ...(dto.endDate !== undefined
          ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
          : {}),
        ...(dto.capacity !== undefined ? { capacity: dto.capacity } : {}),
        ...(dto.tuitionPeriod !== undefined
          ? { tuitionPeriod: dto.tuitionPeriod }
          : {}),
        ...(effectiveTuitionPeriod === ClassTuitionPeriod.CONTACT
          ? { tuitionAmount: null }
          : dto.tuitionAmount !== undefined
            ? { tuitionAmount: dto.tuitionAmount }
            : {}),
        ...(dto.tuitionNotes !== undefined
          ? { tuitionNotes: dto.tuitionNotes?.trim() || null }
          : {}),
        ...(dto.coverPhoto !== undefined
          ? { coverPhoto: dto.coverPhoto || null }
          : {}),
        ...(dto.coverPhotoPublicId !== undefined
          ? { coverPhotoPublicId: dto.coverPhotoPublicId || null }
          : {}),
        ...(dto.images !== undefined ? { images: dto.images } : {}),
        ...(dto.imagePublicIds !== undefined
          ? { imagePublicIds: dto.imagePublicIds }
          : {}),
        ...(location ? location : {}),
        searchTerms,
        ...(dto.schedules
          ? {
              schedules: {
                deleteMany: {},
                create: dto.schedules.map((schedule) => ({
                  ...schedule,
                  isActive: schedule.isActive ?? true,
                })),
              },
            }
          : {}),
      },
      include: this.publicInclude,
    });
  }

  async updateStatus(
    id: string,
    status: ClassStatus,
    userId: string,
    role: string
  ) {
    const item = await this.prisma.class.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Class not found');
    this.assertOwner(item, userId, role);
    return this.prisma.class.update({
      where: { id },
      data: { status },
      include: this.publicInclude,
    });
  }

  async remove(id: string, userId: string, role: string) {
    const item = await this.prisma.class.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Class not found');
    this.assertOwner(item, userId, role);
    await this.prisma.class.delete({ where: { id } });
    return { message: 'Class deleted successfully' };
  }

  private distance(
    lat1?: number,
    lng1?: number,
    lat2?: number | null,
    lng2?: number | null
  ) {
    if (
      lat1 === undefined ||
      lng1 === undefined ||
      lat2 == null ||
      lng2 == null
    )
      return null;
    const radians = (value: number) => (value * Math.PI) / 180;
    const a =
      Math.sin(radians(lat2 - lat1) / 2) ** 2 +
      Math.cos(radians(lat1)) *
        Math.cos(radians(lat2)) *
        Math.sin(radians(lng2 - lng1) / 2) ** 2;
    return (
      Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) /
      10
    );
  }
}
