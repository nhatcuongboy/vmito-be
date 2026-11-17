import { Prisma, Shuttlecock } from '@prisma/client';
import { CreateShuttlecockDto } from './dto/create-shuttlecock.dto';
import { UpdateShuttlecockDto } from './dto/update-shuttlecock.dto';
import {
  IShuttlecockAffiliateStore,
  IShuttlecockItem,
} from './shuttlecocks.types';

/** Lowercased text blob used for the `q` search (name + brand + aliases). */
export function buildShuttlecockSearchTerms(
  name: string,
  brand: string,
  aliases: string[]
): string {
  return [name, brand, ...aliases].join(' ').toLowerCase();
}

/** DB row -> the nested shape the API has always returned. */
export function toShuttlecockItem(row: Shuttlecock): IShuttlecockItem {
  return {
    id: row.id,
    slug: row.slug,
    brand: row.brand,
    name: row.name,
    vietnameseName: row.vietnameseName,
    featuredImage: row.featuredImage,
    galleryImages: row.galleryImages,
    featherType: row.featherType,
    featherCount: row.featherCount,
    corkType: row.corkType,
    speedOptions: row.speedOptions,
    bwfApproved: row.bwfApproved,
    suitability: row.suitability,
    priceRange: {
      minTube: row.minTubePrice,
      maxTube: row.maxTubePrice,
      minCarton: row.minCartonPrice,
      maxCarton: row.maxCartonPrice,
    },
    rating: {
      overall: row.ratingOverall,
      flightStability: row.ratingFlightStability,
      durability: row.ratingDurability,
      feelAndImpact: row.ratingFeelAndImpact,
      totalReviews: row.totalReviews,
    },
    pros: row.pros,
    cons: row.cons,
    description: row.description,
    searchAliases: row.searchAliases,
    affiliateStores:
      row.affiliateStores as unknown as IShuttlecockAffiliateStore[],
  };
}

/** Create DTO -> Prisma create input (applies the same defaults as before). */
export function toShuttlecockCreateInput(
  dto: CreateShuttlecockDto
): Prisma.ShuttlecockCreateInput {
  const searchAliases = dto.searchAliases?.length
    ? dto.searchAliases
    : [dto.name.toLowerCase()];

  return {
    slug: dto.slug,
    brand: dto.brand,
    name: dto.name,
    vietnameseName: dto.vietnameseName,
    featuredImage: dto.featuredImage,
    galleryImages: dto.galleryImages?.length
      ? dto.galleryImages
      : [dto.featuredImage],
    featherType: dto.featherType,
    featherCount: dto.featherCount ?? 16,
    corkType: dto.corkType,
    speedOptions: dto.speedOptions,
    bwfApproved: dto.bwfApproved ?? false,
    suitability: dto.suitability,
    minTubePrice: dto.priceRange.minTube,
    maxTubePrice: dto.priceRange.maxTube,
    minCartonPrice: dto.priceRange.minCarton ?? dto.priceRange.minTube * 48,
    maxCartonPrice: dto.priceRange.maxCarton ?? dto.priceRange.maxTube * 50,
    ratingOverall: dto.rating?.overall ?? 4.5,
    ratingFlightStability: dto.rating?.flightStability ?? 4.5,
    ratingDurability: dto.rating?.durability ?? 4.5,
    ratingFeelAndImpact: dto.rating?.feelAndImpact ?? 4.5,
    totalReviews: dto.rating?.totalReviews ?? 1,
    pros: dto.pros ?? [],
    cons: dto.cons ?? [],
    description: dto.description,
    searchAliases,
    searchTerms: buildShuttlecockSearchTerms(
      dto.name,
      dto.brand,
      searchAliases
    ),
    affiliateStores: (dto.affiliateStores ??
      []) as unknown as Prisma.InputJsonValue,
  };
}

/**
 * Update DTO -> Prisma update input. Only fields present in the DTO are
 * written; searchTerms is rebuilt from the merged name/brand/aliases.
 */
export function toShuttlecockUpdateInput(
  current: Shuttlecock,
  dto: UpdateShuttlecockDto
): Prisma.ShuttlecockUpdateInput {
  const data: Prisma.ShuttlecockUpdateInput = {};

  if (dto.slug !== undefined) data.slug = dto.slug;
  if (dto.brand !== undefined) data.brand = dto.brand;
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.vietnameseName !== undefined)
    data.vietnameseName = dto.vietnameseName;
  if (dto.featuredImage !== undefined) data.featuredImage = dto.featuredImage;
  if (dto.galleryImages !== undefined) data.galleryImages = dto.galleryImages;
  if (dto.featherType !== undefined) data.featherType = dto.featherType;
  if (dto.featherCount !== undefined) data.featherCount = dto.featherCount;
  if (dto.corkType !== undefined) data.corkType = dto.corkType;
  if (dto.speedOptions !== undefined) data.speedOptions = dto.speedOptions;
  if (dto.bwfApproved !== undefined) data.bwfApproved = dto.bwfApproved;
  if (dto.suitability !== undefined) data.suitability = dto.suitability;
  if (dto.pros !== undefined) data.pros = dto.pros;
  if (dto.cons !== undefined) data.cons = dto.cons;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.searchAliases !== undefined) data.searchAliases = dto.searchAliases;
  if (dto.affiliateStores !== undefined) {
    data.affiliateStores =
      dto.affiliateStores as unknown as Prisma.InputJsonValue;
  }

  if (dto.priceRange) {
    if (dto.priceRange.minTube !== undefined)
      data.minTubePrice = dto.priceRange.minTube;
    if (dto.priceRange.maxTube !== undefined)
      data.maxTubePrice = dto.priceRange.maxTube;
    if (dto.priceRange.minCarton !== undefined)
      data.minCartonPrice = dto.priceRange.minCarton;
    if (dto.priceRange.maxCarton !== undefined)
      data.maxCartonPrice = dto.priceRange.maxCarton;
  }

  if (dto.rating) {
    if (dto.rating.overall !== undefined)
      data.ratingOverall = dto.rating.overall;
    if (dto.rating.flightStability !== undefined) {
      data.ratingFlightStability = dto.rating.flightStability;
    }
    if (dto.rating.durability !== undefined)
      data.ratingDurability = dto.rating.durability;
    if (dto.rating.feelAndImpact !== undefined) {
      data.ratingFeelAndImpact = dto.rating.feelAndImpact;
    }
    if (dto.rating.totalReviews !== undefined)
      data.totalReviews = dto.rating.totalReviews;
  }

  if (
    dto.name !== undefined ||
    dto.brand !== undefined ||
    dto.searchAliases !== undefined
  ) {
    data.searchTerms = buildShuttlecockSearchTerms(
      dto.name ?? current.name,
      dto.brand ?? current.brand,
      dto.searchAliases ?? current.searchAliases
    );
  }

  return data;
}
