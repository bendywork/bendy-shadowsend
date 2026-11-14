import { z } from "zod";
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/constants";

export const UPLOAD_URL = "https://aa08cscht.yixiangmeiju.top/oss/aws/upload";
export const SINGLE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_CHUNKS = Math.ceil(MAX_ATTACHMENT_SIZE_BYTES / UPLOAD_CHUNK_BYTES);

// The first host is in the supplied contract; the second is returned by the live service.
const FILE_HOSTS = new Set(["s3v2.haikouer.top", "s3v2.lamen.top"]);

export function isRemoteFileUrl(value: string): boolean {
  if (!value || value.length > 2048 || /[\r\n\0]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && FILE_HOSTS.has(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash;
  } catch {
    return false;
  }
}

export const remoteFileUrlSchema = z.string().trim().max(2048).refine(isRemoteFileUrl, {
  message: "文件地址不是上传服务返回的有效 HTTPS 地址",
});

export const chunkManifestSchema = z.object({
  version: z.literal(1),
  chunkSize: z.literal(UPLOAD_CHUNK_BYTES),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES),
  chunks: z.array(z.object({
    index: z.number().int().min(0),
    url: remoteFileUrlSchema,
    sizeBytes: z.number().int().positive().max(UPLOAD_CHUNK_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).min(2).max(MAX_UPLOAD_CHUNKS),
}).superRefine((manifest, ctx) => {
  const expectedChunks = Math.ceil(manifest.sizeBytes / manifest.chunkSize);
  if (manifest.sizeBytes <= SINGLE_UPLOAD_BYTES || manifest.chunks.length !== expectedChunks) {
    ctx.addIssue({ code: "custom", message: "分片数量与文件大小不一致" });
  }
  for (const [index, chunk] of manifest.chunks.entries()) {
    const expectedSize = Math.min(manifest.chunkSize, manifest.sizeBytes - index * manifest.chunkSize);
    if (chunk.index !== index || chunk.sizeBytes !== expectedSize) {
      ctx.addIssue({ code: "custom", path: ["chunks", index], message: "分片顺序或大小无效" });
    }
  }
});

export type ChunkManifest = z.infer<typeof chunkManifestSchema>;

export const remoteAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(255).regex(/^[^\r\n\0/\\]+$/),
  mimeType: z.string().trim().min(1).max(120).regex(/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_SIZE_BYTES, "Each file must be <= 10GB"),
  s3Key: remoteFileUrlSchema,
  storage: z.literal("REMOTE"),
  chunkManifest: chunkManifestSchema.nullable().optional().default(null),
}).superRefine((attachment, ctx) => {
  if (attachment.chunkManifest) {
    if (attachment.chunkManifest.sizeBytes !== attachment.sizeBytes ||
        attachment.chunkManifest.chunks[0].url !== attachment.s3Key) {
      ctx.addIssue({ code: "custom", message: "附件与分片清单不一致" });
    }
  } else if (attachment.sizeBytes > SINGLE_UPLOAD_BYTES) {
    ctx.addIssue({ code: "custom", message: "大文件必须包含完整分片清单" });
  }
});

export type RemoteAttachment = z.infer<typeof remoteAttachmentSchema>;
