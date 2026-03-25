import { z } from "zod";
import {
  MAX_ANNOUNCEMENT_IMAGES,
  MAX_ANNOUNCEMENT_IMAGE_BYTES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_MESSAGE_TEXT_CHARS,
} from "@/lib/constants";

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
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z
          .number()
          .int()
          .positive()
          .max(MAX_ATTACHMENT_SIZE_BYTES, "Each file must be <= 10GB"),
        s3Key: z.string().trim().min(1).max(512),
        storage: z.enum(["S3", "DUFS"]).optional().default("S3"),
      }),
    )
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

const announcementImagePayloadSchema = z.object({
  s3Key: z.string().trim().min(1).max(512),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_ANNOUNCEMENT_IMAGE_BYTES, "Announcement image must be <= 200MB"),
  storage: z.enum(["S3", "DUFS"]).optional().default("S3"),
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

