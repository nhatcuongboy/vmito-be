ALTER TABLE "venue_rental_requests"
DROP CONSTRAINT IF EXISTS "venue_rental_requests_requesterId_fkey";

ALTER TABLE "venue_rental_requests"
ADD CONSTRAINT "venue_rental_requests_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
