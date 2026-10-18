import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie } from "@/lib/identity";
import { parseJsonBody } from "@/lib/route";
import { normalizeUploadError } from "@/lib/upload/errors";
import {
  assertUploadFileNameAllowed,
  assertUploadServiceLimit,
  createChunkPlan,
  resolveUploadService,
  sanitizeUploadFileName,
} from "@/lib/upload/plan";
import { assertDailyUploadQuota } from "@/lib/upload/quota";
import { guardUploadRequest } from "@/lib/upload/route-guard";
import { createUploadSession, signUploadSession } from "@/lib/upload/session";
import { storageForService } from "@/lib/upload/types";

type Params = {
  roomCode: string;
};

const createSessionSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255).default("application/octet-stream"),
  sizeBytes: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { roomCode } = await params;
    const context = await guardUploadRequest(request, roomCode);
    const input = await parseJsonBody(request, createSessionSchema);

    const fileName = sanitizeUploadFileName(input.fileName);
    const mimeType = input.mimeType.trim().toLowerCase();
    const service = resolveUploadService(mimeType);

    assertUploadFileNameAllowed(service, fileName);
    assertUploadServiceLimit(service, input.sizeBytes);
    await assertDailyUploadQuota(context.userId, input.sizeBytes);

    const plan = createChunkPlan(input.sizeBytes);
    const session = createUploadSession({
      roomId: context.roomId,
      userId: context.userId,
      service,
      fileName,
      mimeType,
      sizeBytes: input.sizeBytes,
    });

    const secret = getUploadSessionSecret();
    if (!secret) {
      throw new ApiError(
        503,
        "上传会话密钥未配置",
        "UPLOAD_SESSION_SECRET_MISSING",
      );
    }

    const response = jsonOk({
      session: signUploadSession(session, secret),
      service,
      storage: storageForService(service),
      chunkSize: plan.chunkSize,
      totalChunks: plan.totalChunks,
      lastChunkBytes: plan.lastChunkBytes,
      expiresAt: session.expiresAt,
    });

    return applyUserCookie(response, context.cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/sessions failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(normalizeUploadError(error));
  }
}
