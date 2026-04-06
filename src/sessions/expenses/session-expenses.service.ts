import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSessionExpenseDto } from './dto/create-session-expense.dto';
import { UpdateSessionExpenseDto } from './dto/update-session-expense.dto';

@Injectable()
export class SessionExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async verifySessionOwnership(
    sessionId: string,
    userId: string,
    role?: string
  ) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { hostId: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (role !== 'ADMIN' && session.hostId !== userId) {
      throw new ForbiddenException('Only the session host can manage expenses');
    }
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
