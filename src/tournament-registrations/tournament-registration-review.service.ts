import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  CategoryRegistrationMode,
  Prisma,
  TournamentRegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentAccessService } from '../common/tournament-access/tournament-access.service';
import {
  ListRegistrationRequestsDto,
  ReviewRegistrationDto,
} from './dto/review-registration.dto';
import {
  assertCategoryAcceptingRegistrations,
  assertTournamentReviewable,
} from './registration-eligibility.helper';
import {
  REQUEST_INCLUDE,
  categoryCounts,
  findRegisteredUserIds,
  requestUserIds,
} from './registration.queries';
import { TournamentRegistrationNotifier } from './tournament-registration.notifier';

type Db = Prisma.TransactionClient;

const PLAYER_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  gender: true,
  level: true,
  levelDescription: true,
  image: true,
} satisfies Prisma.UserSelect;

type PlayerSourceUser = Prisma.UserGetPayload<{
  select: typeof PLAYER_USER_SELECT;
}>;

/**
 * Organizer side of self-registration. Approving a request only ever CREATES
 * rows (players, pair, category registration); existing players, registrations
 * and matches are never modified, so published results stay intact. Linked
 * players earn ranking points through the normal tournament points flow.
 */
@Injectable()
export class TournamentRegistrationReviewService {
  constructor(
    private prisma: PrismaService,
    private access: TournamentAccessService,
    private notifier: TournamentRegistrationNotifier
  ) {}

  async list(
    tournamentId: string,
    query: ListRegistrationRequestsDto,
    userId: string,
    role?: string
  ) {
    await this.assertParticipantsAccess(tournamentId, userId, role);
    return this.prisma.tournamentRegistrationRequest.findMany({
      where: {
        tournamentId,
        ...(query.status && { status: query.status }),
        ...(query.categoryId && { categoryId: query.categoryId }),
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(
    tournamentId: string,
    requestId: string,
    dto: ReviewRegistrationDto,
    userId: string,
    role?: string
  ) {
    const tournament = await this.assertParticipantsAccess(
      tournamentId,
      userId,
      role
    );
    assertTournamentReviewable(tournament);

    const approved = await this.prisma.$transaction(
      async (tx) => {
        const request = await this.loadPendingRequest(
          tx,
          tournamentId,
          requestId
        );
        const category = await tx.category.findUniqueOrThrow({
          where: { id: request.categoryId },
        });
        // The organizer may still approve into a category they closed to new
        // requests, but never into a locked (matches generated) or full one.
        assertCategoryAcceptingRegistrations(
          category,
          await categoryCounts(tx, category.id),
          { ignoreEnabledFlag: true }
        );

        const userIds = requestUserIds(request);
        if ((await findRegisteredUserIds(tx, category.id, userIds)).length) {
          throw new ConflictException(
            'A member of this request is already registered in this category'
          );
        }

        const users = await tx.user.findMany({
          where: { id: { in: userIds } },
          select: PLAYER_USER_SELECT,
        });
        const byId = new Map(users.map((u) => [u.id, u]));
        if (byId.size !== userIds.length) {
          throw new BadRequestException(
            'A member of this request no longer exists'
          );
        }

        const players: { id: string; name: string }[] = [];
        for (const id of userIds) {
          players.push(
            await this.playerForUser(
              tx,
              tournamentId,
              byId.get(id)!,
              id === request.userId ? request.phone : null
            )
          );
        }
        for (const name of request.guestPartnerNames) {
          players.push(
            await tx.tournamentPlayer.create({
              data: { tournamentId, name },
              select: { id: true, name: true },
            })
          );
        }

        const registration = await this.createCategoryRegistration(
          tx,
          tournamentId,
          category,
          players
        );

        return this.markReviewed(tx, requestId, {
          status: TournamentRegistrationStatus.APPROVED,
          response: dto.response,
          reviewerId: userId,
          categoryRegistrationId: registration.id,
        });
      },
      { timeout: 30000, maxWait: 10000 }
    );

    await this.notifyReviewed(tournament.name, approved, true);
    return approved;
  }

  async reject(
    tournamentId: string,
    requestId: string,
    dto: ReviewRegistrationDto,
    userId: string,
    role?: string
  ) {
    const tournament = await this.assertParticipantsAccess(
      tournamentId,
      userId,
      role
    );
    await this.loadPendingRequest(this.prisma, tournamentId, requestId);
    const rejected = await this.markReviewed(this.prisma, requestId, {
      status: TournamentRegistrationStatus.REJECTED,
      response: dto.response,
      reviewerId: userId,
    });
    await this.notifyReviewed(tournament.name, rejected, false);
    return rejected;
  }

  private async assertParticipantsAccess(
    tournamentId: string,
    userId: string,
    role?: string
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, hostId: true, status: true },
    });
    if (!tournament) throw new NotFoundException('Tournament not found');
    await this.access.assertManageAccess({
      tournamentId,
      hostId: tournament.hostId,
      userId,
      role,
      scope: 'PARTICIPANTS',
    });
    return tournament;
  }

  private async loadPendingRequest(
    db: Db,
    tournamentId: string,
    requestId: string
  ) {
    const request = await db.tournamentRegistrationRequest.findUnique({
      where: { id: requestId },
    });
    if (!request || request.tournamentId !== tournamentId) {
      throw new NotFoundException('Registration request not found');
    }
    if (request.status !== TournamentRegistrationStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be reviewed');
    }
    return request;
  }

  /** Conditional on PENDING so two concurrent reviews cannot both succeed. */
  private async markReviewed(
    db: Db,
    requestId: string,
    input: {
      status: TournamentRegistrationStatus;
      response?: string;
      reviewerId: string;
      categoryRegistrationId?: string;
    }
  ) {
    const { count } = await db.tournamentRegistrationRequest.updateMany({
      where: { id: requestId, status: TournamentRegistrationStatus.PENDING },
      data: {
        status: input.status,
        response: input.response?.trim() || null,
        reviewedById: input.reviewerId,
        reviewedAt: new Date(),
        ...(input.categoryRegistrationId && {
          categoryRegistrationId: input.categoryRegistrationId,
        }),
      },
    });
    if (count === 0) {
      throw new ConflictException('This request was already reviewed');
    }
    return db.tournamentRegistrationRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
  }

  /** INDIVIDUAL → the single player; TEAM → a new pair holding the roster. */
  private async createCategoryRegistration(
    db: Db,
    tournamentId: string,
    category: Pick<Category, 'id' | 'type' | 'registrationMode'>,
    players: { id: string; name: string }[]
  ) {
    if (category.registrationMode === CategoryRegistrationMode.INDIVIDUAL) {
      return db.categoryRegistration.create({
        data: { categoryId: category.id, tournamentPlayerId: players[0].id },
      });
    }
    const pair = await db.tournamentPair.create({
      data: {
        tournamentId,
        name: players.map((p) => p.name).join(' / '),
        type: category.type,
        members: {
          create: players.map((p, index) => ({
            playerId: p.id,
            position: index + 1,
          })),
        },
      },
    });
    return db.categoryRegistration.create({
      data: { categoryId: category.id, tournamentPairId: pair.id },
    });
  }

  /**
   * Reuses the user's existing player in this tournament untouched (so their
   * other registrations and results are unaffected), otherwise creates one
   * from the account profile.
   */
  private async playerForUser(
    db: Db,
    tournamentId: string,
    user: PlayerSourceUser,
    phone: string | null
  ) {
    const existing = await db.tournamentPlayer.findFirst({
      where: { tournamentId, userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });
    if (existing) return existing;
    return db.tournamentPlayer.create({
      data: {
        tournamentId,
        userId: user.id,
        name: user.name,
        email: user.email,
        phone: phone ?? user.phone,
        gender: user.gender,
        level: user.level,
        levelDescription: user.levelDescription,
        // URL only — never the account's Cloudinary publicId, so replacing the
        // player avatar can't delete the user's own image.
        image: user.image,
      },
      select: { id: true, name: true },
    });
  }

  private notifyReviewed(
    tournamentName: string,
    request: Prisma.TournamentRegistrationRequestGetPayload<{
      include: typeof REQUEST_INCLUDE;
    }>,
    approved: boolean
  ) {
    return this.notifier.reviewed(
      {
        requestId: request.id,
        tournamentId: request.tournamentId,
        tournamentName,
        categoryName: request.category.name,
        requesterId: request.userId,
        requesterName: request.user.name,
        partnerUserIds: request.partnerUserIds,
      },
      approved,
      request.response
    );
  }
}
