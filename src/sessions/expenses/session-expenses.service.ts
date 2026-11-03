import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSessionExpenseDto } from './dto/create-session-expense.dto';
import { UpdateSessionExpenseDto } from './dto/update-session-expense.dto';
import { SessionAccessService } from '../../common/session-access/session-access.service';

@Injectable()
export class SessionExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SessionAccessService
  ) {}

  private async verifySessionOwnership(
    sessionId: string,
    userId: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, hostId: true, status: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.access.assertAccess(
      session,
      userId,
      role,
      'SESSION',
      'expense.manage'
    );
  }

  findAll(sessionId: string) {
    return this.prisma.sessionExpense.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    sessionId: string,
    dto: CreateSessionExpenseDto,
    userId: string,
    role?: string
  ) {
    await this.verifySessionOwnership(sessionId, userId, role);

    return this.prisma.sessionExpense.create({
      data: {
        sessionId,
        name: dto.name,
        amount: dto.amount,
      },
    });
  }

  async update(
    sessionId: string,
    expenseId: string,
    dto: UpdateSessionExpenseDto,
    userId: string,
    role?: string
  ) {
    await this.verifySessionOwnership(sessionId, userId, role);

    const expense = await this.prisma.sessionExpense.findFirst({
      where: { id: expenseId, sessionId },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    return this.prisma.sessionExpense.update({
      where: { id: expenseId },
      data: dto,
    });
  }

  async remove(
    sessionId: string,
    expenseId: string,
    userId: string,
    role?: string
  ) {
    await this.verifySessionOwnership(sessionId, userId, role);

    const expense = await this.prisma.sessionExpense.findFirst({
      where: { id: expenseId, sessionId },
    });

    if (!expense) {
      throw new NotFoundException('Expense not found');
    }

    await this.prisma.sessionExpense.delete({ where: { id: expenseId } });
  }
}
