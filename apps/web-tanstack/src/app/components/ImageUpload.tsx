import { useState, useRef, type ChangeEvent } from 'react';
import * as Sentry from '@sentry/react';
import { toast } from 'sonner';

interface BlobUploadResult {
  url: string;
  pathname: string;
  contentType: string;
  contentDisposition: string;
}

interface ImageUploadProps {
  onUploadComplete?: (result: BlobUploadResult) => void;
  folder?: string;
  acceptedTypes?: string[];
  maxSizeMB?: number;
}

export function ImageUpload({
  onUploadComplete,
  folder = 'uploads',
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  maxSizeMB = 4.5,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<BlobUploadResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Invalid file type. Accepted: ${acceptedTypes.join(', ')}`);
      return;
    }

    // Validate file size (4.5MB limit for server uploads)
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${maxSizeMB}MB`);
      return;
    }

    setIsUploading(true);

    try {
      // Generate unique filename
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
      const filename = `${folder}/${timestamp}-${safeName}`;

      // Upload to Vercel Blob via API route
      const response = await fetch(`/api/blob-upload?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const result: BlobUploadResult = await response.json();
      setUploadedImage(result);
      onUploadComplete?.(result);
      toast.success('Image uploaded successfully!');
    } catch (error) {
      Sentry.captureException(error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <input
          ref={inputRef}
          type="file"
          accept={acceptedTypes.join(',')}
          onChange={handleFileChange}
          disabled={isUploading}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 bg-[#121212] text-white border-2 border-[#121212] hover:bg-white hover:text-[#121212] transition-colors disabled:opacity-50"
          style={{ boxShadow: '4px 4px 0px 0px rgba(18,18,18,1)' }}
        >
          {isUploading ? 'Uploading...' : 'Upload Image'}
        </button>
        {isUploading && (
          <div className="w-5 h-5 border-2 border-[#121212] border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {uploadedImage && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Uploaded:</p>
          <div className="relative">
            <img
              src={uploadedImage.url}
              alt="Uploaded"
              className="max-w-xs border-2 border-[#121212]"
              style={{ boxShadow: '4px 4px 0px 0px rgba(18,18,18,1)' }}
            />
          </div>
          <p className="text-xs text-gray-600 break-all">{uploadedImage.url}</p>
        </div>
      )}
    </div>
  );
}

// Hook for uploading images
export function useImageUpload() {
  const [isUploading, setIsUploading] = useState(false);

  const uploadImage = async (
    file: File,
    folder: string = 'uploads'
  ): Promise<BlobUploadResult | null> => {
    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '-');
      const filename = `${folder}/${timestamp}-${safeName}`;

      const response = await fetch(`/api/blob-upload?filename=${encodeURIComponent(filename)}`, {
        method: 'POST',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result: BlobUploadResult = await response.json();
      return result;
    } catch (error) {
      Sentry.captureException(error);
      toast.error('Upload failed');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadImage, isUploading };
}
