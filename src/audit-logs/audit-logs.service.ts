import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogAction, Prisma } from '@prisma/client';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface CreateAuditLogInput {
  action: AuditLogAction;
  entity?: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  details?: Prisma.JsonValue;
  ipAddress?: string;
  userAgent?: string;
  status?: number;
  errorMessage?: string;
  requestMethod?: string;
  requestUrl?: string;
  responseStatusCode?: number;
  durationMs?: number;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write a single audit log entry. Fire-and-forget safe — catches its own
   * errors so callers never crash because logging failed.
   */
  async create(input: CreateAuditLogInput) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          ...input,
          details: input.details as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Log to console but never throw — audit logging must not break the app.
      console.error('[AuditLogsService] Failed to write audit log:', error);
      return null;
    }
  }

  /**
   * Query audit logs with filters, pagination, and sorting.
   * Admin-only — caller must enforce access control.
   */
  async findAll(query: QueryAuditLogsDto) {
    const { action, userId, entity, entityId, search, statusCode, fromDate, toDate, page = 1, limit = 20 } = query;

    const where: Prisma.AuditLogWhereInput = {};

    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (statusCode) where.responseStatusCode = statusCode;

    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(fromDate);
      if (toDate) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(toDate);
    }

    if (search) {
      const term = search;
      where.OR = [
        { userName: { contains: term, mode: 'insensitive' } },
        { userEmail: { contains: term, mode: 'insensitive' } },
        { errorMessage: { contains: term, mode: 'insensitive' } },
        { requestUrl: { contains: term, mode: 'insensitive' } },
        { entity: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Delete logs older than the given date. Used for periodic cleanup.
   */
  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: date } },
    });
    return result.count;
  }
}
