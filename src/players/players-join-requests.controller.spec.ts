import { PlayersController } from './players.controller';

describe('PlayersController join requests', () => {
  it('forwards current user pagination to the service', async () => {
    const playersService = {
      getMyJoinRequests: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      withdrawMyJoinRequest: jest.fn(),
    };
    const controller = new PlayersController(
      playersService as never,
      undefined as never
    );

    await controller.getMyJoinRequests({ userId: 'user-1' }, '2', '10');

    expect(playersService.getMyJoinRequests).toHaveBeenCalledWith(
      'user-1',
      2,
      10
    );
  });

  it('uses the authenticated user when withdrawing a request', async () => {
    const playersService = {
      getMyJoinRequests: jest.fn(),
      withdrawMyJoinRequest: jest.fn().mockResolvedValue({ deleted: 1 }),
    };
    const controller = new PlayersController(
      playersService as never,
      undefined as never
    );

    await controller.withdrawMyJoinRequest('session-1', { userId: 'user-1' });

    expect(playersService.withdrawMyJoinRequest).toHaveBeenCalledWith(
      'user-1',
      'session-1'
    );
  });
});
