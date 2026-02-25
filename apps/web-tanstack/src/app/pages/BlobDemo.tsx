import { useState } from 'react';
import { ImageUpload } from '@/components/ImageUpload';
import { toast } from 'sonner';

export default function BlobUploadDemo() {
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);

  const handleUploadComplete = (result: { url: string }) => {
    setUploadedUrls(prev => [...prev, result.url]);
    toast.success('Upload complete!');
  };

  return (
    <div className="min-h-screen bg-[#fdfdfb] p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="paper-panel p-6">
          <h1 
            className="text-3xl font-black uppercase tracking-tighter mb-2"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Vercel Blob Upload Demo
          </h1>
          <p className="text-gray-600">
            Test image uploads to Vercel Blob storage
          </p>
        </div>

        {/* Upload Component */}
        <div className="paper-panel p-6 space-y-4">
          <h2 
            className="text-xl font-bold uppercase tracking-tight"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Upload Image
          </h2>
          <ImageUpload
            onUploadComplete={handleUploadComplete}
            folder="demo"
          />
        </div>

        {/* Uploaded Images */}
        {uploadedUrls.length > 0 && (
          <div className="paper-panel p-6 space-y-4">
            <h2 
              className="text-xl font-bold uppercase tracking-tight"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Uploaded Images
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {uploadedUrls.map((url, index) => (
                <div key={index} className="space-y-2">
                  <img
                    src={url}
                    alt={`Upload ${index + 1}`}
                    className="w-full h-32 object-cover border-2 border-[#121212]"
                    style={{ boxShadow: '4px 4px 0px 0px rgba(18,18,18,1)' }}
                  />
                  <p className="text-xs text-gray-500 break-all">{url}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="paper-panel p-6 space-y-4">
          <h2 
            className="text-xl font-bold uppercase tracking-tight"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Setup Required
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Run <code className="bg-gray-200 px-1">vercel link</code> to connect project</li>
            <li>Run <code className="bg-gray-200 px-1">vercel storage add blob</code></li>
            <li>Run <code className="bg-gray-200 px-1">vercel env pull</code> to get token</li>
            <li>Restart dev server</li>
          </ol>
          <p className="text-sm text-gray-600">
            See <code>docs/VERCEL_BLOB_SETUP.md</code> for full instructions
          </p>
        </div>
      </div>
    </div>
  );
}
