import { z } from "zod";
import {
  isAllowedRemoteAttachmentUrl,
  isRemoteAttachmentStorage,
  MAX_ATTACHMENT_CHUNKS,
  MAX_REMOTE_ATTACHMENT_URL_LENGTH,
  parseAttachmentChunkManifest,
} from "@/lib/attachment-storage";
import {
  MAX_ANNOUNCEMENT_IMAGES,
  MAX_ANNOUNCEMENT_IMAGE_BYTES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_MESSAGE_TEXT_CHARS,
} from "@/lib/constants";

const attachmentStorageSchema = z.enum(["S3", "DUFS", "SANG", "PIC_SL"]);

const chunkDescriptorSchema = z.object({
  index: z.number().int().min(0),
  url: z
    .string()
    .trim()
    .min(1)
    .max(MAX_REMOTE_ATTACHMENT_URL_LENGTH),
  sizeBytes: z.number().int().positive(),
  sha256: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, "SHA-256 must be 64 hex characters")
    .transform((value) => value.toLowerCase())
    .optional(),
});

const chunkManifestSchema = z.object({
  uploadId: z.string().trim().min(1).max(200).optional(),
  storage: attachmentStorageSchema.optional(),
  chunkSize: z.number().int().positive(),
  totalChunks: z.number().int().min(1).max(MAX_ATTACHMENT_CHUNKS),
  sizeBytes: z.number().int().positive().optional(),
  chunks: z
    .array(chunkDescriptorSchema)
    .min(1)
    .max(MAX_ATTACHMENT_CHUNKS),
});

const attachmentPayloadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_ATTACHMENT_SIZE_BYTES, "Each file must be <= 10GB"),
    s3Key: z
      .string()
      .trim()
      .min(1)
      .max(MAX_REMOTE_ATTACHMENT_URL_LENGTH),
    storage: attachmentStorageSchema.optional().default("S3"),
    chunkManifest: chunkManifestSchema.optional(),
  })
  .superRefine((attachment, ctx) => {
    if (
      isRemoteAttachmentStorage(attachment.storage) &&
      !isAllowedRemoteAttachmentUrl(attachment.storage, attachment.s3Key)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["s3Key"],
        message: "远端附件必须使用对应服务的 HTTPS 公网 URL",
      });
    }

    if (!attachment.chunkManifest) {
      return;
    }

    if (!isRemoteAttachmentStorage(attachment.storage)) {
      ctx.addIssue({
        code: "custom",
        path: ["chunkManifest"],
        message: "仅 SANG / PIC_SL 附件支持分片清单",
      });
      return;
    }

    const manifest = parseAttachmentChunkManifest(
      attachment.chunkManifest,
      attachment.storage,
    );

    if (!manifest) {
      ctx.addIssue({
        code: "custom",
        path: ["chunkManifest"],
        message: "分片清单不合法",
      });
      return;
    }

    if (manifest.chunks[0]?.url !== attachment.s3Key) {
      ctx.addIssue({
        code: "custom",
        path: ["s3Key"],
        message: "分片附件的 s3Key 必须为首片远端 URL",
      });
    }
  });

export const gateCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Gate code must be 6 digits");

export const roomNameSchema = z
  .string()
  .trim()
  .min(1, "Room name is required")
  .max(48, "Room name must be <= 48 chars");

export const createRoomSchema = z.object({
  name: roomNameSchema,
  gateCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || /^\d{6}$/.test(value), {
      message: "Gate code must be 6 digits",
    }),
});

export const joinRoomSchema = z.object({
  gateCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
  inviteToken: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined)),
});

export const inviteSchema = z.object({
  expiresInMinutes: z.number().int().min(1).max(60).optional(),
});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .max(MAX_MESSAGE_TEXT_CHARS, `Message text must be <= ${MAX_MESSAGE_TEXT_CHARS} chars`)
    .optional()
    .transform((value) => (value ? value : undefined)),
  attachments: z
    .array(attachmentPayloadSchema)
    .optional()
    .default([]),
});

export const uploadPrepareSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_ATTACHMENT_SIZE_BYTES, "Each file must be <= 10GB"),
});

export const reviewRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
});

export const roomCodeSchema = z.string().trim().min(4).max(64);

export const updateRoomGateCodeSchema = z.object({
  gateCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || /^\d{6}$/.test(value), {
      message: "Gate code must be 6 digits",
    }),
});

export const updateRoomNeverExpireSchema = z.object({
  neverExpire: z.boolean(),
});

export const updateRoomNameSchema = z.object({
  name: roomNameSchema,
});

export const updateRoomJoinPolicySchema = z.object({
  allowJoinRequest: z.boolean(),
});

const announcementImagePayloadSchema = z
  .object({
    s3Key: z
      .string()
      .trim()
      .min(1)
      .max(MAX_REMOTE_ATTACHMENT_URL_LENGTH),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(120),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(MAX_ANNOUNCEMENT_IMAGE_BYTES, "Announcement image must be <= 200MB"),
    storage: attachmentStorageSchema.optional().default("S3"),
  })
  .superRefine((image, ctx) => {
    if (
      isRemoteAttachmentStorage(image.storage) &&
      !isAllowedRemoteAttachmentUrl(image.storage, image.s3Key)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["s3Key"],
        message: "远端公告图片必须使用对应服务的 HTTPS 公网 URL",
      });
    }
  });

export const roomAnnouncementSchema = z.object({
  text: z
    .string()
    .trim()
    .max(1200, "Announcement text must be <= 1200 chars")
    .optional()
    .transform((value) => (value ? value : undefined)),
  keepImageIndexes: z
    .array(z.number().int().min(0))
    .max(MAX_ANNOUNCEMENT_IMAGES)
    .optional(),
  newImages: z
    .array(announcementImagePayloadSchema)
    .max(MAX_ANNOUNCEMENT_IMAGES)
    .optional(),
  clearImage: z.boolean().optional().default(false),
  // Backward compatibility for old clients.
  image: announcementImagePayloadSchema.optional(),
});

