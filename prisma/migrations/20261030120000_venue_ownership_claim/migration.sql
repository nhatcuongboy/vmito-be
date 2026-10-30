-- A user asking to become the owner of an existing venue, reviewed by an
-- admin in the same queue as other venue requests.

-- AlterEnum
ALTER TYPE "VenueRequestType" ADD VALUE 'OWNERSHIP_CLAIM';
