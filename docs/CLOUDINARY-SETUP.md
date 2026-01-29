# Cloudinary Media Management Setup Guide

This guide explains how to set up and use Cloudinary for media management in the Badminton application.

## Prerequisites

1. Create a Cloudinary account at https://cloudinary.com
2. Get your credentials from the Cloudinary Dashboard

## Backend Setup

### 1. Environment Variables

**Recommended: Use CLOUDINARY_URL**

Add to your `.env` file:

```bash
# Single variable containing all credentials
CLOUDINARY_URL=cloudinary://API_KEY:API_SECRET@CLOUD_NAME
# Example: cloudinary://442569671246665:**********@dzehhkd9m
```

**Alternative: Individual credentials**

```bash
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

The service automatically detects and uses `CLOUDINARY_URL` if available, otherwise falls back to individual credentials.

### 2. Database Migration

Run the Prisma migration to add Cloudinary public ID fields:

```bash
cd badminton-backend
npx prisma migrate dev --name add_cloudinary_public_ids
```

This adds the following fields:
- `User.imagePublicId` - For user avatars
- `HostPaymentSettings.qrCodePublicId` - For QR codes
- `PaymentRecord.proofImagePublicId` - For payment proofs

### 3. Service Usage

The `CloudinaryService` provides methods for uploading and managing images:

```typescript
import { CloudinaryService } from './cloudinary/cloudinary.service';

// Upload QR code
const result = await cloudinaryService.uploadQrCode(file);
// Returns: { url, publicId, secureUrl, format, width, height, bytes }

// Upload payment proof
const result = await cloudinaryService.uploadPaymentProof(file);

// Upload avatar
const result = await cloudinaryService.uploadAvatar(file);

// Delete image
await cloudinaryService.deleteImage(publicId);

// Get optimized URL
const optimizedUrl = cloudinaryService.getOptimizedUrl(publicId, {
  width: 400,
  height: 400,
  crop: 'fill',
  quality: 'auto:good',
});

// Get thumbnail
const thumbnailUrl = cloudinaryService.getThumbnailUrl(publicId, 200);
```

## Frontend Setup

### 1. Environment Variables

Add to your `.env.local` file:

```bash
# Required: Cloud name for client-side components
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dzehhkd9m

# Optional: Full URL for server-side operations (if needed)
CLOUDINARY_URL=cloudinary://442569671246665:**********@dzehhkd9m
```

**Note:** Frontend primarily needs `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` for client-side image rendering. The full `CLOUDINARY_URL` is only needed if you perform server-side Cloudinary operations in Next.js API routes.

### 2. Components

#### CloudinaryImage Component

Automatically optimizes and serves images from Cloudinary:

```tsx
import { CloudinaryImage } from '@/components/cloudinary';

<CloudinaryImage
  src="https://res.cloudinary.com/..."
  alt="Description"
  width={400}
  height={400}
  crop="fill"
  quality="auto:good"
/>
```

#### ImageUploader Component

Reusable component for uploading images:

```tsx
import { ImageUploader } from '@/components/cloudinary';

<ImageUploader
  value={imageUrl}
  onChange={setImageUrl}
  onUpload={async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const response = await uploadAPI(formData);
    return response.url;
  }}
  maxSizeMB={5}
  label="Upload Image"
/>
```

### 3. Utility Functions

```typescript
import { extractPublicId, getOptimizedUrl, getThumbnailUrl } from '@/lib/cloudinary/utils';

// Extract public ID from Cloudinary URL
const publicId = extractPublicId(cloudinaryUrl);

// Get optimized URL
const optimizedUrl = getOptimizedUrl(publicId, {
  width: 800,
  height: 600,
  crop: 'fill',
  quality: 'auto:good',
});

// Get thumbnail
const thumbnail = getThumbnailUrl(publicId, 200);
```

## API Endpoints

### Upload QR Code

```http
POST /api/upload/qr-code
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- qrCode: File (max 5MB, JPEG/PNG/GIF/WebP)

Response:
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "badminton/qr-codes/abc123",
  "secureUrl": "https://res.cloudinary.com/...",
  "format": "png",
  "width": 800,
  "height": 800,
  "bytes": 123456
}
```

### Upload Payment Proof

```http
POST /api/upload/payment-proof
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- proof: File (max 10MB, JPEG/PNG/GIF/WebP)

Response:
{
  "url": "https://res.cloudinary.com/...",
  "publicId": "badminton/payment-proofs/xyz789",
  "secureUrl": "https://res.cloudinary.com/...",
  "format": "jpg",
  "width": 1200,
  "height": 1600,
  "bytes": 234567
}
```

## Image Transformations

Cloudinary automatically applies optimizations:

### QR Codes
- Max dimensions: 800x800px
- Quality: auto:good
- Format: original

### Payment Proofs
- Max dimensions: 1200x1600px
- Quality: auto:good
- Format: original

### Avatars
- Dimensions: 400x400px (cropped to face)
- Quality: auto:good
- Format: auto (WebP when supported)

## Migration from Local Storage

To migrate existing local files to Cloudinary:

1. **Backup your data**
   ```bash
   cd badminton-backend
   ./scripts/backup-db.sh
   ```

2. **Run migration script** (to be created)
   ```bash
   npm run migrate:cloudinary
   ```

3. **Verify migration**
   - Check database records have `publicId` fields populated
   - Test image loading in the application
   - Verify old local files can be safely removed

## Best Practices

1. **Always store publicId** - Save both URL and publicId in the database for better management
2. **Use transformations** - Let Cloudinary handle image optimization instead of pre-processing
3. **Clean up old images** - Delete old images when users update their photos
4. **Use secure URLs** - Always use `secureUrl` (HTTPS) in production
5. **Set up upload presets** - Configure upload presets in Cloudinary dashboard for consistent transformations

## Troubleshooting

### Images not loading
- Check environment variables are set correctly
- Verify Cloudinary credentials are valid
- Check browser console for CORS errors

### Upload failures
- Verify file size is within limits
- Check file format is supported
- Ensure API keys have upload permissions

### Performance issues
- Use appropriate image transformations
- Enable browser caching
- Consider using Cloudinary's CDN features

## Security

1. **Never expose API Secret** - Keep `CLOUDINARY_API_SECRET` server-side only
2. **Use signed uploads** - For sensitive uploads, use signed upload URLs
3. **Validate file types** - Always validate file types on the backend
4. **Set upload limits** - Configure max file sizes and upload quotas
5. **Monitor usage** - Check Cloudinary dashboard for unusual activity

## Resources

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Next Cloudinary](https://next-cloudinary.dev/)
- [Cloudinary Node.js SDK](https://cloudinary.com/documentation/node_integration)
