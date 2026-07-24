import {
  ClosureStatus,
  VenueRequestStatus,
  VenueRequestType,
  VenueStatus,
} from '@prisma/client';
import { VenueRequestsService } from './venue-requests.service';

describe('VenueRequestsService', () => {
  let service: VenueRequestsService;
  let venueFindUnique: jest.Mock;
  let venueRequestCreate: jest.Mock;
  let venueRequestFindUnique: jest.Mock;
  let venueRequestUpdate: jest.Mock;
  let venueCreate: jest.Mock;
  let venueUpdate: jest.Mock;

  beforeEach(() => {
    venueFindUnique = jest.fn();
    venueRequestCreate = jest.fn().mockResolvedValue({ id: 'request-1' });
    venueRequestFindUnique = jest.fn();
    venueRequestUpdate = jest.fn().mockResolvedValue({ id: 'request-1' });
    venueCreate = jest.fn();
    venueUpdate = jest.fn();

    service = new VenueRequestsService(
      {
        venue: { findUnique: venueFindUnique },
        venueRequest: {
          create: venueRequestCreate,
          findUnique: venueRequestFindUnique,
          update: venueRequestUpdate,
        },
      } as never,
      { create: venueCreate, update: venueUpdate } as never
    );
  });

  it('stores and trims a CREATE payload containing only the new address fields', async () => {
    await service.create(
      {
        type: VenueRequestType.CREATE,
        payload: {
          name: '  Sân ABC  ',
          street: '  123 Nguyễn Văn Trỗi  ',
          newDistrict: '  Cầu Kiệu  ',
          newCity: '  TP Hồ Chí Minh  ',
        },
      },
      'user-1'
    );

    expect(venueRequestCreate).toHaveBeenCalledWith({
      data: {
        type: VenueRequestType.CREATE,
        submittedByUserId: 'user-1',
        venueId: null,
        payload: {
          name: 'Sân ABC',
          street: '123 Nguyễn Văn Trỗi',
          newDistrict: 'Cầu Kiệu',
          newCity: 'TP Hồ Chí Minh',
        },
      },
      include: {
        submittedBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        reviewedBy: {
          select: { id: true, name: true, email: true, image: true },
        },
        venue: true,
        appliedVenue: true,
      },
    });
  });

  it('approves CREATE using new fields, composing a fallback address (never forwarding newAddress — VenuesService derives it), leaving legacy city/district null', async () => {
    venueRequestFindUnique.mockResolvedValue({
      id: 'request-1',
      type: VenueRequestType.CREATE,
      status: VenueRequestStatus.PENDING,
      payload: {
        name: 'Sân ABC',
        street: '123 Nguyễn Văn Trỗi',
        newDistrict: 'Cầu Kiệu',
        newCity: 'TP Hồ Chí Minh',
      },
    });
    venueCreate.mockResolvedValue({ id: 'venue-1' });

    await service.approve('request-1', 'admin-1');

    // district/city are intentionally left undefined (-> null in the DB):
    // newDistrict is a ward, a different administrative tier than the
    // legacy district (quận/huyện) column, so copying it over would look
    // like real legacy data while actually being the wrong tier.
    expect(venueCreate).toHaveBeenCalledWith({
      name: 'Sân ABC',
      newDistrict: 'Cầu Kiệu',
      newCity: 'TP Hồ Chí Minh',
      address: '123 Nguyễn Văn Trỗi, Cầu Kiệu, TP Hồ Chí Minh',
      status: VenueStatus.ACTIVE,
      closureStatus: ClosureStatus.OPERATING,
      isVerified: false,
    });
  });

  it('approves UPDATE without forwarding street or copying new values into legacy fields', async () => {
    venueRequestFindUnique.mockResolvedValue({
      id: 'request-1',
      type: VenueRequestType.UPDATE,
      status: VenueRequestStatus.PENDING,
      venueId: 'venue-1',
      payload: {
        street: '123 Nguyễn Văn Trỗi',
        newDistrict: 'Cầu Kiệu',
        newCity: 'TP Hồ Chí Minh',
      },
    });
    venueUpdate.mockResolvedValue({ id: 'venue-1' });

    await service.approve('request-1', 'admin-1');

    // `street` is never forwarded to VenuesService.update — it only exists to
    // build the CREATE-path fallback address; an UPDATE always targets an
    // existing venue that already has its own streetAddress.
    expect(venueUpdate).toHaveBeenCalledWith('venue-1', {
      newDistrict: 'Cầu Kiệu',
      newCity: 'TP Hồ Chí Minh',
    });
  });

  it('keeps approving legacy address updates unchanged', async () => {
    venueRequestFindUnique.mockResolvedValue({
      id: 'request-1',
      type: VenueRequestType.UPDATE,
      status: VenueRequestStatus.PENDING,
      venueId: 'venue-1',
      payload: {
        address: '123 Nguyễn Văn Trỗi',
        district: 'Phú Nhuận',
        city: 'Hồ Chí Minh',
      },
    });
    venueUpdate.mockResolvedValue({ id: 'venue-1' });

    await service.approve('request-1', 'admin-1');

    expect(venueUpdate).toHaveBeenCalledWith('venue-1', {
      address: '123 Nguyễn Văn Trỗi',
      district: 'Phú Nhuận',
      city: 'Hồ Chí Minh',
    });
  });
});
