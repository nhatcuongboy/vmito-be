import { buildRentalReport, startOfLocalDay } from './rental-report';

const timeZone = 'Asia/Ho_Chi_Minh';
const at = (value: string) => new Date(`${value}+07:00`);

const base = {
  from: '2030-01-07',
  to: '2030-01-07',
  timeZone,
  courts: [{ id: 'c1', name: 'Sân 1', code: 'S1' }],
  capacity: 1,
  periods: [{ dayOfWeek: 1, startMinute: 360, endMinute: 1320 }],
  blocks: [],
  rentals: [],
  payments: [],
};

describe('startOfLocalDay', () => {
  it('finds midnight in the venue timezone', () => {
    expect(startOfLocalDay('2030-01-07', timeZone).toISOString()).toBe(
      '2030-01-06T17:00:00.000Z'
    );
  });
});

describe('buildRentalReport', () => {
  const rental = {
    status: 'COMPLETED',
    startTime: at('2030-01-07T18:30:00'),
    endTime: at('2030-01-07T20:00:00'),
    numberOfCourts: 1,
    amount: 150_000,
    customerType: 'WALK_IN',
    isNoShow: false,
    allocations: [
      {
        courtId: 'c1',
        startTime: at('2030-01-07T18:30:00'),
        endTime: at('2030-01-07T20:00:00'),
      },
    ],
  };

  it('splits a booking across the hours it covers', () => {
    const report = buildRentalReport({ ...base, rentals: [rental] });
    expect(report.byHour[18].minutes).toBe(30);
    expect(report.byHour[19].minutes).toBe(60);
    expect(report.byCourt[0].minutes).toBe(90);
  });

  it('measures occupancy against open court time', () => {
    const report = buildRentalReport({ ...base, rentals: [rental] });
    expect(report.availableMinutes).toBe(960);
    expect(report.occupancyPercent).toBe(9);
  });

  it('takes closed time out of what could have been booked', () => {
    const report = buildRentalReport({
      ...base,
      blocks: [
        {
          courtId: null,
          startTime: at('2030-01-07T06:00:00'),
          endTime: at('2030-01-07T14:00:00'),
        },
      ],
    });
    expect(report.availableMinutes).toBe(480);
  });

  it('leaves cancelled bookings out of value and occupancy', () => {
    const report = buildRentalReport({
      ...base,
      rentals: [{ ...rental, status: 'CANCELLED' }],
    });
    expect(report.bookedValue).toBe(0);
    expect(report.bookedMinutes).toBe(0);
    expect(report.cancelled).toBe(1);
  });

  it('nets refunds off the day they were paid back', () => {
    const report = buildRentalReport({
      ...base,
      payments: [
        { amount: 200_000, at: at('2030-01-07T09:00:00') },
        { amount: -50_000, at: at('2030-01-07T10:00:00') },
      ],
    });
    expect(report.collected).toBe(200_000);
    expect(report.refunded).toBe(50_000);
    expect(report.byDay[0].collected).toBe(150_000);
  });

  it('weights a booking without named courts by its court count', () => {
    const report = buildRentalReport({
      ...base,
      courts: [],
      capacity: 4,
      rentals: [{ ...rental, numberOfCourts: 2, allocations: [] }],
    });
    expect(report.bookedMinutes).toBe(180);
    expect(report.availableMinutes).toBe(3840);
  });
});
