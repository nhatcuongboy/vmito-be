# Session Cover Photo Feature

## Overview
This feature allows session hosts to upload and manage cover photos for their badminton sessions. Cover photos are stored in Cloudinary and optimized for display.

## Database Schema
Added to `Session` model:
- `coverPhoto`: String (nullable) - Cloudinary URL for the cover photo
- `coverPhotoPublicId`: String (nullable) - Cloudinary public ID for deletion

## API Endpoints

### Upload Cover Photo
**POST** `/sessions/:id/cover-photo`

**Authentication**: Required (JWT)

**Authorization**: Only session host or admin

**Request**:
- Content-Type: `multipart/form-data`
- Body: `file` (image file)

**Supported formats**: jpg, jpeg, png, gif, webp

**Image optimization**:
- Resized to 1200x630px (fill crop)
- Auto quality optimization
- Auto format conversion

**Response**:
```json
{
  "id": "session_id",
  "name": "Session name",
  "coverPhoto": "https://res.cloudinary.com/...",
  "coverPhotoPublicId": "badminton/session-covers/...",
  ...
}
```

### Delete Cover Photo
**DELETE** `/sessions/:id/cover-photo`

**Authentication**: Required (JWT)

**Authorization**: Only session host or admin

**Response**: Updated session object with `coverPhoto` and `coverPhotoPublicId` set to null

## Usage Examples

### Upload Cover Photo (cURL)
```bash
curl -X POST \
  http://localhost:3000/sessions/{session_id}/cover-photo \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/image.jpg"
```

### Upload Cover Photo (JavaScript/Fetch)
```javascript
const formData = new FormData();
formData.append('file', imageFile);

const response = await fetch(`/sessions/${sessionId}/cover-photo`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const session = await response.json();
console.log('Cover photo URL:', session.coverPhoto);
```

### Delete Cover Photo (cURL)
```bash
curl -X DELETE \
  http://localhost:3000/sessions/{session_id}/cover-photo \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Implementation Details

### CloudinaryService
New method: `uploadSessionCoverPhoto(file: Express.Multer.File)`
- Uploads to `badminton/session-covers/` folder
- Applies transformation: 1200x630px, auto quality, auto format

### SessionsService
New methods:
- `uploadCoverPhoto(sessionId, file, userId, role)`: Uploads and updates session
- `deleteCoverPhoto(sessionId, userId, role)`: Deletes from Cloudinary and updates session

### Authorization
- Only the session host or users with ADMIN role can upload/delete cover photos
- Throws `ForbiddenException` if unauthorized

### Automatic Cleanup
- When uploading a new cover photo, the old one is automatically deleted from Cloudinary
- When deleting a session, the cover photo is automatically removed (via Cloudinary cleanup)

## Frontend Integration Notes

1. **Display cover photo**: Use the `coverPhoto` URL from session object
2. **Upload UI**: Create a file input with image preview
3. **Error handling**: Handle file size limits and format validation
4. **Loading states**: Show upload progress indicator
5. **Fallback**: Display default image if `coverPhoto` is null

## Migration
Migration file: `20260129103032_add_session_cover_photo`
- Adds `coverPhoto` and `coverPhotoPublicId` columns to `sessions` table
- Both columns are nullable for backward compatibility
