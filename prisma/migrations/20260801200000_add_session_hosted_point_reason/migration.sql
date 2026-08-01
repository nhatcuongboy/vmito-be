-- AlterEnum
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new value
-- is not used in the same transaction.
ALTER TYPE "public"."PointReason" ADD VALUE 'SESSION_HOSTED';
