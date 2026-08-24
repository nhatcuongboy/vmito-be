import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  const prisma = {
    featureFlag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  let service: FeatureFlagsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FeatureFlagsService(prisma as never);
  });

  it('only exposes client-visible flags through the public map', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { key: 'PUBLIC_FLAG', enabled: true },
    ]);

    await expect(service.getAll()).resolves.toEqual({ PUBLIC_FLAG: true });
    expect(prisma.featureFlag.findMany).toHaveBeenCalledWith({
      where: { clientVisible: true },
      select: { key: true, enabled: true },
    });
  });

  it('reads server-only flags by key', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });

    await expect(service.isEnabled('SERVER_FLAG')).resolves.toBe(true);
    expect(prisma.featureFlag.findUnique).toHaveBeenCalledWith({
      where: { key: 'SERVER_FLAG' },
      select: { enabled: true },
    });
  });

  it('treats a missing flag as disabled', async () => {
    prisma.featureFlag.findUnique.mockResolvedValue(null);

    await expect(service.isEnabled('MISSING_FLAG')).resolves.toBe(false);
  });
});
