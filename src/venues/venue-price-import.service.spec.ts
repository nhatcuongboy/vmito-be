import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VenueCustomerType, VenueDayType } from '@prisma/client';
import { VenuePriceImportService } from './venue-price-import.service';
import { CreateVenuePriceRuleDto } from './dto/venue-pricing.dto';

const rule = (
  overrides: Partial<CreateVenuePriceRuleDto> = {}
): CreateVenuePriceRuleDto => ({
  dayType: VenueDayType.EVERYDAY,
  startMinute: 300,
  endMinute: 960,
  customerType: VenueCustomerType.WALK_IN,
  pricePerHour: 80000,
  ...overrides,
});

type DataArgs<T> = [{ data: T }];

describe('VenuePriceImportService', () => {
  const tx = {
    venuePriceBook: {
      create: jest.fn<Promise<unknown>, DataArgs<Record<string, unknown>>>(),
      findUniqueOrThrow: jest.fn(),
    },
    venuePriceRule: {
      createMany: jest.fn<
        Promise<unknown>,
        DataArgs<Record<string, unknown>[]>
      >(),
      deleteMany: jest.fn(),
    },
  };
  const prisma = {
    venuePriceBook: { findFirst: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
      callback(tx)
    ),
  };
  const venueAccess = {
    assertManager: jest.fn(),
    ensureVenue: jest.fn(),
  };
  const service = new VenuePriceImportService(
    prisma as never,
    venueAccess as never
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates the book and all rules in one transaction', async () => {
    tx.venuePriceBook.create.mockResolvedValue({ id: 'book-1' });
    tx.venuePriceBook.findUniqueOrThrow.mockResolvedValue({
      id: 'book-1',
      rules: [],
    });

    await service.importPriceBook(
      'venue-1',
      {
        book: { name: 'Giá 2026', effectiveFrom: '2026-01-01T00:00:00Z' },
        rules: [rule(), rule({ customerType: VenueCustomerType.FIXED })],
      },
      'user-1',
      'ADMIN'
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.venuePriceBook.create.mock.calls[0][0].data).toMatchObject({
      venueId: 'venue-1',
      name: 'Giá 2026',
      currency: 'VND',
      isActive: true,
    });
    const createdRules = tx.venuePriceRule.createMany.mock.calls[0][0].data;
    expect(createdRules).toHaveLength(2);
    expect(createdRules[0]).toMatchObject({
      priceBookId: 'book-1',
      daysOfWeek: [],
    });
  });

  it('rejects an invalid rule with its index before writing', async () => {
    await expect(
      service.importPriceBook(
        'venue-1',
        {
          book: { name: 'Giá', effectiveFrom: '2026-01-01T00:00:00Z' },
          rules: [rule(), rule({ startMinute: 600, endMinute: 600 })],
        },
        'user-1',
        'ADMIN'
      )
    ).rejects.toThrow(
      new BadRequestException(
        'rules[1]: endMinute must be greater than startMinute'
      )
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces existing rules when asked', async () => {
    prisma.venuePriceBook.findFirst.mockResolvedValue({ id: 'book-1' });

    await service.bulkCreateRules(
      'venue-1',
      'book-1',
      { rules: [rule()], replaceExisting: true },
      'user-1',
      'ADMIN'
    );

    expect(tx.venuePriceRule.deleteMany).toHaveBeenCalledWith({
      where: { priceBookId: 'book-1' },
    });
    expect(tx.venuePriceRule.createMany).toHaveBeenCalledTimes(1);
  });

  it('keeps existing rules by default', async () => {
    prisma.venuePriceBook.findFirst.mockResolvedValue({ id: 'book-1' });

    await service.bulkCreateRules(
      'venue-1',
      'book-1',
      { rules: [rule()] },
      'user-1',
      'ADMIN'
    );

    expect(tx.venuePriceRule.deleteMany).not.toHaveBeenCalled();
  });

  it('404s when the price book belongs to another venue', async () => {
    prisma.venuePriceBook.findFirst.mockResolvedValue(null);
    await expect(
      service.bulkCreateRules(
        'venue-1',
        'book-x',
        { rules: [rule()] },
        'user-1',
        'ADMIN'
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
