import { randomUUID } from 'crypto';
import { supabase } from './supabaseClient';

const NEED_EVIDENCE_BUCKET = process.env.SUPABASE_NEED_EVIDENCE_BUCKET || 'need-evidence';
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function validateImageUpload(needId: string, fileBuffer: Buffer, contentType: string): void {
  if (!needId || !needId.trim()) {
    throw new Error('Invalid need id');
  }

  // Owner-only write intent in app code:
  // uploads are always forced under the scoped prefix {needId}/... and cannot target arbitrary paths.
  if (!contentType || !contentType.toLowerCase().startsWith('image/')) {
    throw new Error('Only image uploads are allowed');
  }

  if (fileBuffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('Image exceeds 10MB limit');
  }
}

function mapStorageError(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return 'Storage operation failed';
  }

  const err = error as { message?: string; statusCode?: number; error?: string };
  const message = (err.message || err.error || '').toLowerCase();

  if (err.statusCode === 404 || message.includes('bucket') && message.includes('not found')) {
    return 'Storage bucket not found';
  }

  if (err.statusCode === 401 || err.statusCode === 403 || message.includes('permission')) {
    return 'Storage permission denied';
  }

  if (message.includes('payload too large') || message.includes('too large')) {
    return 'File too large';
  }

  return 'Storage operation failed';
}

export async function getSignedUrl(path: string, expiresIn: number): Promise<string> {
  const { data, error } = await supabase.storage
    .from(NEED_EVIDENCE_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) {
    const safeMessage = mapStorageError(error);
    console.error('Failed to create signed URL for evidence file:', {
      path,
      reason: safeMessage
    });
    throw new Error(safeMessage);
  }

  return data.signedUrl;
}

export async function uploadNeedImage(
  needId: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  validateImageUpload(needId, fileBuffer, contentType);

  const timestamp = Date.now();
  const path = `${needId}/${timestamp}.jpg`;

  const { error } = await supabase.storage
    .from(NEED_EVIDENCE_BUCKET)
    .upload(path, fileBuffer, {
      contentType,
      upsert: false,
      cacheControl: '3600',
      metadata: {
        source: 'need-ingestion',
        uploadId: randomUUID()
      }
    });

  if (error) {
    const safeMessage = mapStorageError(error);
    console.error('Failed to upload need evidence image:', {
      needId,
      path,
      reason: safeMessage
    });
    throw new Error(safeMessage);
  }

  // Return a signed URL by default for backend/private bucket usage.
  return getSignedUrl(path, 24 * 60 * 60);
}

/*
Migration note:
- Existing Firebase Storage files need a separate backfill/migration script (out of scope for MVP).
- All new uploads should target Supabase Storage only.
*/