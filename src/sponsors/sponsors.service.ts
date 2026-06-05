import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { TournamentAccessService } from '../common/tournament-access/tournament-access.service';
import { CreateSponsorDto } from './dto/create-sponsor.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';

@Injectable()
export class SponsorsService {
  constructor(
    private prisma: PrismaService,
    private cloudinary: CloudinaryService,
    private access: TournamentAccessService
  ) {}

  async findByTournament(tournamentId: string) {
    return this.prisma.tournamentSponsor.findMany({
      where: { tournamentId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const sponsor = await this.prisma.tournamentSponsor.findUnique({
      where: { id },
    });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    return sponsor;
  }

  async create(
    tournamentId: string,
    dto: CreateSponsorDto,
    userId: string,
    role?: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, hostId: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await this.access.assertManageAccess({
      tournamentId,
      hostId: tournament.hostId,
      userId,
      role,
      scope: 'STRUCTURE',
    });

    return this.prisma.tournamentSponsor.create({
      data: {
        tournamentId,
        name: dto.name,
        logo: dto.logo ?? null,
        logoPublicId: dto.logoPublicId ?? null,
        website: dto.website ?? null,
        displayOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async update(
    id: string,
    dto: UpdateSponsorDto,
    userId: string,
    role?: string
  ) {
    const sponsor = await this.getSponsorWithOwnership(id, userId, role);

    // When the logo is replaced or removed, clean up the previous Cloudinary asset.
    const isLogoChanged =
      dto.logoPublicId !== undefined &&
      dto.logoPublicId !== sponsor.logoPublicId;
    if (isLogoChanged && sponsor.logoPublicId) {
      await this.cloudinary.deleteImage(sponsor.logoPublicId);
    }

    return this.prisma.tournamentSponsor.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.logo !== undefined && { logo: dto.logo || null }),
        ...(dto.logoPublicId !== undefined && {
          logoPublicId: dto.logoPublicId || null,
        }),
        ...(dto.website !== undefined && { website: dto.website || null }),
        ...(dto.displayOrder !== undefined && {
          displayOrder: dto.displayOrder,
        }),
      },
    });
  }

  async remove(id: string, userId: string, role?: string) {
    const sponsor = await this.getSponsorWithOwnership(id, userId, role);

    if (sponsor.logoPublicId) {
      await this.cloudinary.deleteImage(sponsor.logoPublicId);
    }

    await this.prisma.tournamentSponsor.delete({ where: { id } });
    return { success: true };
  }

  private async getSponsorWithOwnership(
    id: string,
    userId: string,
    role?: string
  ) {
    const sponsor = await this.prisma.tournamentSponsor.findUnique({
      where: { id },
      include: { tournament: { select: { hostId: true } } },
    });
    if (!sponsor) throw new NotFoundException('Sponsor not found');
    await this.access.assertManageAccess({
      tournamentId: sponsor.tournamentId,
      hostId: sponsor.tournament.hostId,
      userId,
      role,
      scope: 'STRUCTURE',
    });
    return sponsor;
  }
}
