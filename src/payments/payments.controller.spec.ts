import { PaymentsController } from './payments.controller';
import { resolveActingUserId } from './acting-user.util';

describe('resolveActingUserId', () => {
  it('lets an ADMIN act as the override id', () => {
    expect(
      resolveActingUserId({ userId: 'admin-1', role: 'ADMIN' }, 'target-1')
    ).toBe('target-1');
  });

  it('uses the ADMIN’s own id when no override is given', () => {
    expect(resolveActingUserId({ userId: 'admin-1', role: 'ADMIN' })).toBe(
      'admin-1'
    );
  });

  it.each(['HOST', 'PLAYER', 'REFEREE', undefined])(
    'ignores the override for role %s',
    (role) => {
      expect(resolveActingUserId({ userId: 'user-1', role }, 'target-1')).toBe(
        'user-1'
      );
    }
  );
});

describe('PaymentsController transaction endpoints', () => {
  const service = {
    getPlayerTransactionSummary: jest.fn(),
    getHostTransactionSummary: jest.fn(),
    getPlayerTransactionsWithHost: jest.fn(),
    getHostTransactionsWithUser: jest.fn(),
  };
  const controller = new PaymentsController(service as never);
  const admin = { userId: 'admin-1', role: 'ADMIN' };
  const host = { userId: 'host-1', role: 'HOST' };

  beforeEach(() => jest.clearAllMocks());

  describe('GET payments/me/summary', () => {
    it('lets an ADMIN read another user’s summary', async () => {
      await controller.getPlayerTransactionSummary(admin, 'target-1');
      expect(service.getPlayerTransactionSummary).toHaveBeenCalledWith(
        'target-1'
      );
    });

    it('ignores userId from a non-admin', async () => {
      await controller.getPlayerTransactionSummary(host, 'target-1');
      expect(service.getPlayerTransactionSummary).toHaveBeenCalledWith(
        'host-1'
      );
    });

    it('defaults to the caller when no userId is passed', async () => {
      await controller.getPlayerTransactionSummary(admin);
      expect(service.getPlayerTransactionSummary).toHaveBeenCalledWith(
        'admin-1'
      );
    });
  });

  describe('GET payments/host/summary', () => {
    it('lets an ADMIN read another host’s summary', async () => {
      await controller.getHostTransactionSummary(admin, 'target-host');
      expect(service.getHostTransactionSummary).toHaveBeenCalledWith(
        'target-host'
      );
    });

    it('ignores hostId from a non-admin', async () => {
      await controller.getHostTransactionSummary(host, 'target-host');
      expect(service.getHostTransactionSummary).toHaveBeenCalledWith('host-1');
    });
  });

  describe('GET payments/me/host/:hostId', () => {
    it('lets an ADMIN read another player’s transactions with a host', async () => {
      await controller.getPlayerTransactionsWithHost(
        'some-host',
        admin,
        'target-1'
      );
      expect(service.getPlayerTransactionsWithHost).toHaveBeenCalledWith(
        'target-1',
        'some-host'
      );
    });

    it('ignores userId from a non-admin', async () => {
      await controller.getPlayerTransactionsWithHost(
        'some-host',
        host,
        'target-1'
      );
      expect(service.getPlayerTransactionsWithHost).toHaveBeenCalledWith(
        'host-1',
        'some-host'
      );
    });
  });

  describe('GET payments/host/user/:userId', () => {
    it('lets an ADMIN read another host’s transactions with a user', async () => {
      await controller.getHostTransactionsWithUser(
        'some-user',
        admin,
        'target-host'
      );
      expect(service.getHostTransactionsWithUser).toHaveBeenCalledWith(
        'target-host',
        'some-user'
      );
    });

    it('ignores hostId from a non-admin', async () => {
      await controller.getHostTransactionsWithUser(
        'some-user',
        host,
        'target-host'
      );
      expect(service.getHostTransactionsWithUser).toHaveBeenCalledWith(
        'host-1',
        'some-user'
      );
    });
  });
});
