-- Class photos get their own image-library category instead of sharing
-- SESSION_COVER with session covers.
ALTER TYPE "ImageCategory" ADD VALUE 'CLASS_COVER';
