import { HostReportController } from './host-report.controller';

describe('HostReportController', () => {
  const service = { getReport: jest.fn() };
  const controller = new HostReportController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('lets an ADMIN report on the host given in the query', async () => {
    const query = { hostId: 'target-host' };
    await controller.getReport(query, { userId: 'admin-1', role: 'ADMIN' });
    expect(service.getReport).toHaveBeenCalledWith('target-host', query);
  });

  it('reports on the ADMIN’s own id when no hostId is given', async () => {
    const query = {};
    await controller.getReport(query, { userId: 'admin-1', role: 'ADMIN' });
    expect(service.getReport).toHaveBeenCalledWith('admin-1', query);
  });

  it('ignores hostId from a non-admin', async () => {
    const query = { hostId: 'target-host' };
    await controller.getReport(query, { userId: 'host-1', role: 'HOST' });
    expect(service.getReport).toHaveBeenCalledWith('host-1', query);
  });
});
