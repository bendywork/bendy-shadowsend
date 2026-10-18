import type { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie } from "@/lib/identity";
import { parseJsonBody } from "@/lib/route";
import { UPLOAD_MAX_CHUNKS } from "@/lib/upload/constants";
import { normalizeUploadError } from "@/lib/upload/errors";
import { buildUploadManifest } from "@/lib/upload/manifest";
import { buildMergeUrl, signMergeToken } from "@/lib/upload/merge";
import { guardUploadRequest } from "@/lib/upload/route-guard";
import { verifyUploadSession } from "@/lib/upload/session";

type Params = {
  roomCode: string;
};

const completeSchema = z.object({
  session: z.string().min(1),
  chunks: z
    .array(
      z.object({
        index: z.number().int().min(0),
        url: z.string().url(),
        sizeBytes: z.number().int().positive(),
        sha256: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{64}$/i, "SHA-256 must be 64 hex characters")
          .optional(),
      }),
    )
    .max(UPLOAD_MAX_CHUNKS),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { roomCode } = await params;
    const context = await guardUploadRequest(request, roomCode);
    const input = await parseJsonBody(request, completeSchema);

    const secret = getUploadSessionSecret();
    if (!secret) {
      throw new ApiError(
        503,
        "上传会话密钥未配置",
        "UPLOAD_SESSION_SECRET_MISSING",
      );
    }

    const session = verifyUploadSession(input.session, secret);

    if (session.roomId !== context.roomId || session.userId !== context.userId) {
      throw new ApiError(403, "上传会话与当前用户或房间不匹配", "UPLOAD_SESSION_MISMATCH");
    }

    const manifest = buildUploadManifest(session, input.chunks);
    const mergeToken = signMergeToken(
      { roomId: session.roomId, manifest },
      secret,
    );
    const response = jsonOk({
      ...manifest,
      mergeToken,
      mergeUrl: buildMergeUrl(roomCode, mergeToken),
    });

    return applyUserCookie(response, context.cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/sessions/complete failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(normalizeUploadError(error));
  }
}
