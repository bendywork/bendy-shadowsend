import { z } from "zod";

export const gateCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "门禁码必须是 6 位数字");

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "房间名不能为空").max(48, "房间名最多 48 字"),
  gateCode: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => !value || /^\d{6}$/.test(value), {
      message: "门禁码必须是 6 位数字",
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
    .max(5000, "文本消息最多 5000 字")
    .optional()
    .transform((value) => (value ? value : undefined)),
  attachments: z
    .array(
      z.object({
        fileName: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().min(1).max(120),
        sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
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
  sizeBytes: z.number().int().positive().max(1024 * 1024 * 1024),
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
      message: "门禁码必须是 6 位数字",
    }),
});

export const roomAnnouncementSchema = z.object({
  text: z
    .string()
    .trim()
    .max(1200, "公告文本最多 1200 字")
    .optional()
    .transform((value) => (value ? value : undefined)),
  clearImage: z.boolean().optional().default(false),
  image: z
    .object({
      s3Key: z.string().trim().min(1).max(512),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.string().trim().min(1).max(120),
      sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
      storage: z.enum(["S3", "DUFS"]).optional().default("S3"),
    })
    .optional(),
});

