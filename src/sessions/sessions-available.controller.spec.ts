import { BadRequestException } from '@nestjs/common';
import { SessionsController } from './sessions.controller';

describe('SessionsController getAvailable courtCount validation', () => {
  const createController = () => {
    const findAvailable = jest.fn().mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
    });
    const sessionsService = { findAvailable };
    const controller = new SessionsController(
      sessionsService as never,
      undefined as never,
      undefined as never
    );
    return { controller, findAvailable };
  };

  it('forwards parsed minCourts and maxCourts for exact court count', () => {
    const { controller, findAvailable } = createController();

    controller.getAvailable(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2',
      '2'
    );

    expect(findAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        minCourts: 2,
        maxCourts: 2,
      }),
      undefined
    );
  });

  it('forwards minCourts=4 and undefined maxCourts for 4+ courts', () => {
    const { controller, findAvailable } = createController();

    controller.getAvailable(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '4',
      undefined
    );

    expect(findAvailable).toHaveBeenCalledWith(
      expect.objectContaining({
        minCourts: 4,
        maxCourts: undefined,
      }),
      undefined
    );
  });

  it('throws BadRequestException if minCourts is not a positive integer', () => {
    const { controller } = createController();

    expect(() =>
      controller.getAvailable(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '0',
        undefined
      )
    ).toThrow(new BadRequestException('Invalid minCourts'));

    expect(() =>
      controller.getAvailable(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1.5',
        undefined
      )
    ).toThrow(new BadRequestException('Invalid minCourts'));

    expect(() =>
      controller.getAvailable(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'abc',
        undefined
      )
    ).toThrow(new BadRequestException('Invalid minCourts'));
  });

  it('throws BadRequestException if maxCourts is not a positive integer', () => {
    const { controller } = createController();

    expect(() =>
      controller.getAvailable(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '1',
        '0'
      )
    ).toThrow(new BadRequestException('Invalid maxCourts'));
  });

  it('throws BadRequestException if minCourts exceeds maxCourts', () => {
    const { controller } = createController();

    expect(() =>
      controller.getAvailable(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        '4',
        '2'
      )
    ).toThrow(new BadRequestException('minCourts must not exceed maxCourts'));
  });
});
