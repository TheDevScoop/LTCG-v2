const VERCEL_BLOB_BASE =
  'https://ubssmtksaikjji5g.public.blob.vercel-storage.com/lunchtable/lunchtable'

/** Resolve an asset URL from blob storage using a relative path. */
export function blob(path: string): string {
  return `${VERCEL_BLOB_BASE}/${path}`
}
