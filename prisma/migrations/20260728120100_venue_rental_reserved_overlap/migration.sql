-- RESERVED must block the same Court just like active holds and confirmed bookings.
-- Kept in its own migration so the value added by the previous one is already
-- committed: Postgres rejects reading a freshly added enum value in the
-- transaction that added it ("unsafe use of new value").
ALTER TABLE "venue_rental_court_allocations" DROP CONSTRAINT "venue_rental_court_allocations_no_overlap";
ALTER TABLE "venue_rental_court_allocations"
ADD CONSTRAINT "venue_rental_court_allocations_no_overlap"
EXCLUDE USING gist (
  "courtId" WITH =,
  tsrange("startTime", "endTime", '[)') WITH &&
)
WHERE ("status" IN ('HELD', 'RESERVED', 'CONFIRMED'));
