# Cloudinary Integration - Quick Start

## Setup Steps

### 1. Get Cloudinary Credentials

1. Sign up at https://cloudinary.com
2. Go to Dashboard
3. Copy your credentials:
   - Cloud Name
   - API Key
   - API Secret

### 2. Configure Backend

Add to `badminton-backend/.env`:

**Option 1: Using CLOUDINARY_URL (Recommended)**
```bash
CLOUDINARY_URL=cloudinary://442569671246665:**********@dzehhkd9m
```

**Option 2: Individual credentials**
```bash
CLOUDINARY_CLOUD_NAME=dzehhkd9m
CLOUDINARY_API_KEY=442569671246665
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. Configure Frontend

Add to `badminton-frontend/.env.local`:

```bash
# Required for client-side components (CldImage, etc.)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dzehhkd9m

# Optional: For server-side operations if needed
CLOUDINARY_URL=cloudinary://442569671246665:**********@dzehhkd9m
```

### 4. Run Database Migration

```bash
cd badminton-backend
npx prisma generate
npx prisma migrate dev --name add_cloudinary_public_ids
```

### 5. Migrate Existing Files (Optional)

If you have existing local files:

```bash
cd badminton-backend
npx ts-node scripts/migrate-to-cloudinary.ts
```

### 6. Test Upload

Start both servers and test uploading:
- QR codes in payment settings
- Payment proofs in session payments
- User avatars (future feature)

## What Changed

### Backend
- ✅ New `CloudinaryService` for image management
- ✅ Updated `UploadsService` to use Cloudinary
- ✅ API now returns `{ url, publicId, format, width, height, bytes }`
- ✅ Database schema includes `publicId` fields

### Frontend
- ✅ New `CloudinaryImage` component for optimized images
- ✅ New `ImageUploader` component for uploads
- ✅ Utility functions for URL manipulation

### Database
- ✅ `User.imagePublicId` - For avatars
- ✅ `HostPaymentSettings.qrCodePublicId` - For QR codes
- ✅ `PaymentRecord.proofImagePublicId` - For payment proofs

## Benefits

1. **Automatic Optimization** - Images are automatically compressed and optimized
2. **CDN Delivery** - Fast global delivery via Cloudinary CDN
3. **Transformations** - On-the-fly image resizing and cropping
4. **Storage Management** - Easy deletion and cleanup of old images
5. **Scalability** - No local storage limitations

## Next Steps

After setup, you can:
1. Update frontend components to use `CloudinaryImage`
2. Implement avatar upload for users
3. Add image transformations as needed
4. Set up Cloudinary upload presets for consistency

See `docs/CLOUDINARY-SETUP.md` for detailed documentation.
