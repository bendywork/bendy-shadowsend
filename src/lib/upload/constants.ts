/**
 * Upload relay limits.
 *
 * Vercel Functions cap non-streaming request bodies at 4.5MB, so the browser
 * must never send more than that in one request. Chunks are kept at 4MB to
 * leave room for multipart overhead.
 */
export const VERCEL_FUNCTION_BODY_LIMIT_BYTES = Math.floor(4.5 * 1024 * 1024);
export const UPLOAD_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_SINGLE_REQUEST_MAX_BYTES = UPLOAD_CHUNK_SIZE_BYTES;

export const UPLOAD_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export const UPLOAD_RATE_LIMIT_PER_MINUTE = 180;
export const UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000;

export const UPLOAD_DAILY_BYTES_PER_USER = 2 * 1024 * 1024 * 1024;

export const SANG_MAX_BYTES = 100 * 1024 * 1024;
export const SANG_MEITU_MAX_BYTES = 20 * 1024 * 1024;
export const PIC_SL_MAX_BYTES = 200 * 1024 * 1024;

export const UPLOAD_MAX_CHUNKS = Math.ceil(PIC_SL_MAX_BYTES / UPLOAD_CHUNK_SIZE_BYTES);

export const UPLOAD_REMOTE_ATTEMPTS = 3;
export const UPLOAD_REMOTE_TIMEOUT_MS = 30_000;
export const UPLOAD_REMOTE_RETRY_DELAY_MS = 400;
export const UPLOAD_REMOTE_MAX_RETRY_DELAY_MS = 3_000;

/**
 * Chunk-level concurrency and resume (up-11).
 *
 * Four chunks in flight keeps 200MB / 50-chunk uploads moving without
 * saturating the browser connection pool or the server-side per-user rate
 * limit. A failed chunk is retried three times in total (dc-06), then the
 * whole file pauses so the user can resume later.
 */
export const UPLOAD_CHUNK_CONCURRENCY = 4;
export const UPLOAD_CHUNK_MAX_ATTEMPTS = 3;
export const UPLOAD_CHUNK_RETRY_DELAY_MS = 400;
export const UPLOAD_CHUNK_MAX_RETRY_DELAY_MS = 3_000;

export const UPLOAD_RESUME_STORAGE_KEY = "bendy:upload-resume:v1";
export const UPLOAD_RESUME_MAX_RECORDS = 10;
