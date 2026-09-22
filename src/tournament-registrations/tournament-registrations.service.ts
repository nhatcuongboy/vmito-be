import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentRegistrationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitRegistrationDto } from './dto/submit-registration.dto';
import {
  assertCategoryAcceptingRegistrations,
  assertTournamentAcceptingRegistrations,
  categoryClosedReason,
  normalizeRoster,
  tournamentClosedReason,
} from './registration-eligibility.helper';
import {
  REQUEST_INCLUDE,
  categoryCounts,
  findPendingConflict,
  findRegisteredUserIds,
  withPartners,
  withPartnersOne,
} from './registration.queries';
import { TournamentRegistrationNotifier } from './tournament-registration.notifier';

/**
 * User side of tournament self-registration: submit / cancel a request and
 * read what is open. Requests only become players once an organizer approves
 * them (see TournamentRegistrationReviewService).
 */
@Injectable()
export class TournamentRegistrationsService {
  constructor(
    private prisma: PrismaService,
    private notifier: TournamentRegistrationNotifier
  ) {}

  async getRegistrationInfo(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        registrationOpen: true,
        registrationDeadline: true,
        isPublished: true,
        status: true,
        categories: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            type: true,
            registrationMode: true,
            teamSize: true,
            registrationEnabled: true,
            maxRegistrations: true,
            _count: { select: { registrations: true, matches: true } },
          },
        },
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');

    const closedReason = tournamentClosedReason(tournament);
    return {
      tournamentId: tournament.id,
      registrationOpen: tournament.registrationOpen,
      registrationDeadline: tournament.registrationDeadline,
      isAccepting: closedReason === null,
      closedReason,
      categories: tournament.categories.map(({ _count, ...category }) => {
        const categoryReason = categoryClosedReason(category, {
          matchCount: _count.matches,
          registrationCount: _count.registrations,
        });
        return {
          ...category,
          registrationCount: _count.registrations,
          isAccepting: closedReason === null && categoryReason === null,
          closedReason: closedReason ?? categoryReason,
        };
      }),
    };
  }

  async submit(
    tournamentId: string,
    dto: SubmitRegistrationDto,
    userId: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        name: true,
        hostId: true,
        registrationOpen: true,
        registrationDeadline: true,
        isPublished: true,
        status: true,
      },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    assertTournamentAcceptingRegistrations(tournament);

    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category || category.tournamentId !== tournamentId) {
      throw new NotFoundException('Category not found in this tournament');
    }
    assertCategoryAcceptingRegistrations(
      category,
      await categoryCounts(this.prisma, category.id)
    );

    const roster = normalizeRoster(
      category,
      userId,
      dto.partnerUserIds,
      dto.guestPartnerNames
    );
    const participantIds = [userId, ...roster.partnerUserIds];

    const users = await this.prisma.user.findMany({
      where: { id: { in: participantIds } },
      select: { id: true, name: true },
    });
    if (users.length !== participantIds.length) {
      throw new BadRequestException('Partner not found');
    }

    if (await findPendingConflict(this.prisma, category.id, participantIds)) {
      throw new ConflictException(
        'A pending registration for this category already includes you or your partner'
      );
    }
    const registered = await findRegisteredUserIds(
      this.prisma,
      category.id,
      participantIds
    );
    if (registered.length > 0) {
      throw new ConflictException(
        'You or your partner are already registered in this category'
      );
    }

    const request = await this.prisma.tournamentRegistrationRequest.create({
      data: {
        tournamentId,
        categoryId: category.id,
        userId,
        partnerUserIds: roster.partnerUserIds,
        guestPartnerNames: roster.guestPartnerNames,
        phone: dto.phone?.trim() || null,
        message: dto.message?.trim() || null,
      },
      include: REQUEST_INCLUDE,
    });

    await this.notifier.submitted(
      {
        requestId: request.id,
        tournamentId,
        tournamentName: tournament.name,
        categoryName: category.name,
        requesterId: userId,
        requesterName: users.find((u) => u.id === userId)?.name ?? 'A user',
        partnerUserIds: roster.partnerUserIds,
      },
      tournament.hostId
    );
    return withPartnersOne(this.prisma, request);
  }

  /** Requests the user made or was named as a partner in. */
  async listMine(tournamentId: string, userId: string) {
    const requests = await this.prisma.tournamentRegistrationRequest.findMany({
      where: {
        tournamentId,
        OR: [{ userId }, { partnerUserIds: { has: userId } }],
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return withPartners(this.prisma, requests);
  }

  async cancel(tournamentId: string, requestId: string, userId: string) {
    const request = await this.prisma.tournamentRegistrationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.tournamentId !== tournamentId) {
      throw new NotFoundException('Registration request not found');
    }
    if (request.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own request');
    }
    if (request.status !== TournamentRegistrationStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be cancelled');
    }
    const cancelled = await this.prisma.tournamentRegistrationRequest.update({
      where: { id: requestId },
      data: { status: TournamentRegistrationStatus.CANCELLED },
      include: REQUEST_INCLUDE,
    });
    return withPartnersOne(this.prisma, cancelled);
  }
}
