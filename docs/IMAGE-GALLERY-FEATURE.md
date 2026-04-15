# Image Gallery Feature

## Overview

This feature upgrades the image upload system with two main goals:

1. **User image gallery** — Every uploaded image is associated with the uploading user. When a user opens any upload dialog, they can reuse previously uploaded images instead of re-uploading duplicates.
2. **Session multi-image support** — Hosts can attach up to 5 images per session, with one designated as the banner (cover photo).

---

## Database Changes

### New: `ImageCategory` enum

```prisma
enum ImageCategory {
  SESSION_COVER
  AVATAR
  CLUB
  QR_CODE
  PAYMENT_PROOF
  OTHER
}
```

### New: `UserImage` model

Stores every image uploaded by a user across the entire platform.

```prisma
model UserImage {
  id           String        @id @default(cuid())
  userId       String
  url          String        // Cloudinary secure URL
  publicId     String        // Cloudinary public ID
  originalName String?       // Original filename
  format       String?       // jpg, png, webp, etc.
  width        Int?
  height       Int?
  bytes        Int?
  category     ImageCategory @default(OTHER)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  user         User          @relation("UserImages", ...)

  @@index([userId])
  @@index([userId, category])
  @@map("user_images")
}
```

### Updated: `User` model

```prisma
uploadedImages UserImage[] @relation("UserImages")
```

### Updated: `Session` model

```prisma
images         String[] @default([])   // Additional session images (max 5)
imagePublicIds String[] @default([])   // Cloudinary public IDs for additional images
```

### Migration

`20260415070329_add_user_images_and_session_multi_images`

---

## Backend

### New Module: `src/user-images/`

| File                           | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `user-images.module.ts`        | Module definition, imports PrismaModule + CloudinaryModule |
| `user-images.service.ts`       | Business logic                                             |
| `user-images.controller.ts`    | REST endpoints                                             |
| `dto/query-user-images.dto.ts` | Query params DTO                                           |

#### API Endpoints

**`GET /user-images`** — Get current user's image gallery (paginated)

Query params: `category?`, `page?`, `limit?`

Response:

```json
{
  "success": true,
  "data": {
    "data": [ { "id": "...", "url": "...", "publicId": "...", ... } ],
    "meta": { "total": 10, "page": 1, "limit": 20, "totalPages": 1 }
  }
}
```

**`POST /user-images?category=SESSION_COVER`** — Upload a new image to user gallery

- Content-Type: `multipart/form-data`, field: `file`
- Max size: 10MB
- Accepted: jpg, jpeg, png, gif, webp
- Internally routes to the appropriate Cloudinary upload method based on `category`

Response: the created `UserImage` record wrapped in `{ success: true, data: { ... } }`

**`DELETE /user-images/:id`** — Delete an image from user gallery

- Also deletes the file from Cloudinary
- Admins can delete any image; regular users can only delete their own

#### Session Image Endpoints

**`PUT /sessions/:id/images`** — Replace all session images

Body:

```json
{ "images": ["url1", "url2"], "imagePublicIds": ["pid1", "pid2"] }
```

**`PUT /sessions/:id/banner`** — Set session banner (from existing images)

Body:

```json
{ "coverPhoto": "url", "coverPhotoPublicId": "pid" }
```

#### Backfill on Existing Upload Endpoints

All existing upload endpoints (`/uploads/avatar`, `/uploads/club-image`, `/uploads/qr-code`, `/uploads/payment-proof`) were updated to also create a `UserImage` record on every upload. This means the user gallery is populated retroactively as users interact with the app.

---

## Frontend

### New Types (`src/lib/api/types.ts`)

```typescript
enum EImageCategory {
  SESSION_COVER = 'SESSION_COVER',
  AVATAR = 'AVATAR',
  CLUB = 'CLUB',
  QR_CODE = 'QR_CODE',
  PAYMENT_PROOF = 'PAYMENT_PROOF',
  OTHER = 'OTHER',
}

interface IUserImage {
  id: string;
  userId: string;
  url: string;
  publicId: string;
  originalName?: string;
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  category: EImageCategory;
  createdAt: string;
  updatedAt: string;
}

interface IUserImageListResponse {
  data: IUserImage[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}
```

`ISession` and `CreateSessionRequest` were also updated with `images?: string[]` and `imagePublicIds?: string[]`.

### New API Service (`src/lib/api/user-image.service.ts`)

```typescript
UserImageService.getMyImages(category?, page?, limit?)  // GET /user-images
UserImageService.uploadImage(file, category)            // POST /user-images
UserImageService.deleteImage(id)                        // DELETE /user-images/:id
```

All methods use `ApiResponse<T>` wrapper and return `response.data.data!`, consistent with other services.

### New Component: `AppImageGalleryPicker`

Path: `src/components/AppImageGalleryPicker.tsx`

A modal (size `xl`) with two tabs:

| Tab            | Behaviour                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **My Images**  | Shows user's gallery as a 3-column grid. Multi-select up to `maxSelect`. Infinite scroll (page size 20). Delete button with confirm dialog. Selected images have green border + checkmark. |
| **Upload New** | Drag-and-drop / click-to-upload area. On successful upload, image is added to gallery and auto-selected. Tab switches back to "My Images" to show the result.                              |

Props:

```typescript
{
  isOpen: boolean;
  onClose: () => void;
  onSelect: (images: { url: string; publicId: string }[]) => void;
  selectedImages?: ISelectedImage[];
  maxSelect?: number;           // default 5
  category?: EImageCategory;    // default SESSION_COVER
}
```

Key implementation notes:

- `isMounted` guard prevents SSR hydration mismatch on modal
- `tabIndex` is controlled state; resets to 0 on open, switches to 0 after upload
- `Array.isArray()` guard on API response for safety
- Images uploaded without any client-side resize/crop — originals are sent as-is

### New Component: `AppMultiImageUpload`

Path: `src/components/session/AppMultiImageUpload.tsx`

Sortable image grid for session forms. Features:

- Up to 5 images displayed in a CSS grid
- **Drag-to-reorder** via `@dnd-kit/core` + `@dnd-kit/sortable`
- **Set as banner** (star button) — highlighted with green border + "Banner" badge
- **Remove** button per image
- "Add image" button opens `AppImageGalleryPicker`
- Empty state shows a placeholder with dashed border

Exports `ISessionImage` type: `{ url: string; publicId: string }`

Banner index adjusts automatically on drag/remove.

### New Component: `AppImageGallery`

Path: `src/components/session/AppImageGallery.tsx`

Read-only image display for session detail pages. Responsive:

| Viewport          | Layout                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| Mobile            | Horizontal scroll-snap carousel with dot indicators and `1/N` counter    |
| Desktop (≥ 768px) | Airbnb-style asymmetric grid: 1 large image left + up to 4 smaller right |

Features:

- Lightbox: fullscreen modal with prev/next navigation, keyboard support (← → Esc), image counter
- Deduplicates `coverPhoto` from the `images` array, always shows it first
- Falls back gracefully when there is only one image (no carousel/grid chrome)

Props:

```typescript
{
  images: string[];
  coverPhoto?: string;
}
```

### Updated: `SessionForm`

- Replaced single `CoverPhotoUpload` with `AppMultiImageUpload`
- State: `sessionImages: ISessionImage[]`, `bannerIndex: number`
- On create: includes `images`, `imagePublicIds`, `coverPhoto`, `coverPhotoPublicId` in request body
- On edit: same fields included in update body
- Banner is always `sessionImages[bannerIndex]`

### Updated: `SessionOverviewTab`

- Replaced `<Image src={session.coverPhoto} />` with `<AppImageGallery images={session.images ?? []} coverPhoto={session.coverPhoto} />`

---

## i18n Keys Added

Namespace `session`:

| Key                  | vi                                  | en                                          |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| `myImages`           | Ảnh của tôi                         | My Images                                   |
| `uploadNew`          | Tải ảnh mới                         | Upload New                                  |
| `selectFromGallery`  | Chọn từ thư viện                    | Select from library                         |
| `maxImages`          | Tối đa {max} ảnh                    | Max {max} images                            |
| `setAsBanner`        | Đặt làm banner                      | Set as banner                               |
| `removeImage`        | Xóa ảnh                             | Remove image                                |
| `noImagesYet`        | Chưa có ảnh nào                     | No images yet                               |
| `imageDeleted`       | Đã xóa ảnh                          | Image deleted                               |
| `imageDeleteFailed`  | Xóa ảnh thất bại                    | Failed to delete image                      |
| `deleteImageConfirm` | Bạn có chắc muốn xóa ảnh này không? | Are you sure you want to delete this image? |
| `sessionImages`      | Ảnh kèo                             | Session Images                              |
| `addImage`           | Thêm ảnh                            | Add image                                   |
| `bannerImage`        | Ảnh banner                          | Banner image                                |
| `currentBanner`      | Banner                              | Banner                                      |
| `addImages`          | Thêm ảnh                            | Add images                                  |
| `dragToReorder`      | Kéo để sắp xếp lại                  | Drag to reorder                             |

Namespace `common`:

| Key        | vi      | en       |
| ---------- | ------- | -------- |
| `selected` | đã chọn | selected |

---

## Bug Fixes Applied

| Bug                                | Root cause                                                                    | Fix                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Modal not centered                 | `ChakraModal` had no `xl` size case, fell through to `400px`                  | Added `xl: 800px`                                               |
| Tab click submitted form           | `ChakraTabs > Tab` uses `<Box as="button">` which defaults to `type="submit"` | Added `type="button"` to `Tab`                                  |
| Gallery images empty               | `user-image.service.ts` returned raw axios body instead of unwrapped `data`   | Changed to `ApiResponse<T>` + `response.data.data!`             |
| `[null]` in session payload        | Same root cause — `uploaded.url` was `undefined` causing `null` in map        | Fixed by same service fix above                                 |
| `MISSING_MESSAGE: common.selected` | i18n key didn't exist in `common` namespace                                   | Added `selected` to all 3 locale files                          |
| SSR hydration error on modal       | Modal rendered server-side before client mount                                | Added `isMounted` guard: `<Modal isOpen={isMounted && isOpen}>` |
