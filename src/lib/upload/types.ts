export type UploadServiceId = "sang" | "pic-sl";

export type UploadStorageId = "SANG" | "PIC_SL";

export type SangChannel = "meitu" | "icve";

export type UploadFileDescriptor = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type ChunkPlan = {
  chunkSize: number;
  totalChunks: number;
  lastChunkBytes: number;
};

export type UploadSessionPayload = {
  v: 1;
  sid: string;
  roomId: string;
  userId: string;
  service: UploadServiceId;
  storage: UploadStorageId;
  fileName: string;
  mimeType: string;
  totalBytes: number;
  chunkSize: number;
  totalChunks: number;
  issuedAt: number;
  expiresAt: number;
};

export type UploadChunkDescriptor = {
  index: number;
  url: string;
  sizeBytes: number;
  /** Lower-case SHA-256 hex digest of the exact chunk bytes. */
  sha256?: string;
};

export type UploadManifest = {
  uploadId: string;
  service: UploadServiceId;
  storage: UploadStorageId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  chunkSize: number;
  totalChunks: number;
  chunks: UploadChunkDescriptor[];
};

export function storageForService(service: UploadServiceId): UploadStorageId {
  return service === "sang" ? "SANG" : "PIC_SL";
}
