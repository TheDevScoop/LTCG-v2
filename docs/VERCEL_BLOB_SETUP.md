# Vercel Blob Setup for LTCG-v2

## Overview

This project uses **Vercel Blob** for image storage and serving. All images are uploaded to Vercel Blob and served via CDN.

## Setup Instructions

### 1. Connect Vercel Blob to Your Project

```bash
# In your terminal, run:
vercel link

# Then create a Blob store:
vercel storage add blob

# Or go to Vercel Dashboard:
# 1. Go to your project on vercel.com
# 2. Click "Storage" tab
# 3. Click "Connect Database"
# 4. Select "Blob" and create a new store
# 5. Name it: "lunchtable-images"
```

### 2. Pull Environment Variables

```bash
# This will add BLOB_READ_WRITE_TOKEN to your .env.local
vercel env pull
```

### 3. Verify Installation

The `@vercel/blob` package is already installed via bun:

```bash
bun add @vercel/blob
```

## API Route

**File:** `api/blob-upload.ts`

This Vercel Function handles image uploads:
- Validates file types (jpg, png, webp, gif, svg)
- Uploads to Vercel Blob
- Returns public URL

## Upload Component

**File:** `apps/web/src/components/ImageUpload.tsx` (legacy client)

Usage:

```tsx
import { ImageUpload } from '@/components/ImageUpload';

// In your component:
<ImageUpload
  onUploadComplete={(result) => {
    console.log('Image URL:', result.url);
    // Save to Convex or use directly
  }}
  folder="avatars" // Optional: organize uploads
/>
```

Or use the hook:

```tsx
import { useImageUpload } from '@/components/ImageUpload';

const { uploadImage, isUploading } = useImageUpload();

const handleFile = async (file: File) => {
  const result = await uploadImage(file, 'cards');
  if (result) {
    // result.url contains the Vercel Blob URL
  }
};
```

## Migrating Existing Images

To upload all existing images from `public/lunchtable/` to Vercel Blob:

```bash
# Make sure BLOB_READ_WRITE_TOKEN is set
export BLOB_READ_WRITE_TOKEN=your_token_here

# Run migration
bun scripts/migrate-images-to-blob.ts
```

This will:
1. Scan all images in `public/lunchtable/`
2. Upload them to Vercel Blob
3. Generate a JSON report with URL mappings
4. Print find/replace commands for updating your codebase

## Image URLs

Once migrated, update your image references:

**Before:**
```tsx
<img src="/lunchtable/logo.png" />
```

**After:**
```tsx
<img src="https://xxxx.public.blob.vercel-storage.com/lunchtable/logo.png" />
```

Or use the component with automatic URL handling.

## File Structure

```
api/
└── blob-upload.ts              # Vercel Function for uploads

apps/web/                       # Legacy React Router client (optional uploader UI)
├── src/
│   ├── components/
│   │   └── ImageUpload.tsx     # React upload component
│   └── ...
└── public/
    └── lunchtable/             # Current image location
```

## Environment Variables

Add to `.env.local`:

```
# Vercel Blob (auto-generated when connecting storage)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxx...
```

**⚠️ Never commit this token to git!**

## Limits

- **Server uploads:** 4.5MB per file
- **Client uploads:** Available for larger files (more complex setup)
- **Storage:** Based on your Vercel plan

## Next Steps

1. Run `vercel link` to connect your project
2. Run `vercel storage add blob` to create storage
3. Run `vercel env pull` to get the token
4. Test upload with the ImageUpload component
5. Run migration script to move existing images
6. Update image URLs in your codebase

## Support

- [Vercel Blob Docs](https://vercel.com/docs/vercel-blob)
- [Server Uploads Guide](https://vercel.com/docs/vercel-blob/server-upload)
- [Client Uploads Guide](https://vercel.com/docs/vercel-blob/client-upload)
