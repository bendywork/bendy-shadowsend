import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie } from "@/lib/identity";
import { normalizeUploadError } from "@/lib/upload/errors";
import { expectedChunkBytes } from "@/lib/upload/manifest";
import { buildChunkFileName } from "@/lib/upload/plan";
import { uploadToPicSl } from "@/lib/upload/remote/pic-sl";
import { uploadToSang } from "@/lib/upload/remote/sang";
import { guardUploadRequest } from "@/lib/upload/route-guard";
import { verifyUploadSession } from "@/lib/upload/session";

type Params = {
  roomCode: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { roomCode } = await params;
    const context = await guardUploadRequest(request, roomCode);

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("multipart/form-data")) {
      throw new ApiError(
        415,
        "请使用 multipart/form-data 上传分片",
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiError(400, "无法解析上传内容", "INVALID_MULTIPART");
    }

    const sessionToken = formData.get("session");
    const chunkIndexRaw = formData.get("chunkIndex");
    const uploaded = formData.get("file");

    if (typeof sessionToken !== "string" || !sessionToken) {
      throw new ApiError(400, "缺少上传会话", "UPLOAD_SESSION_MISSING");
    }

    if (typeof chunkIndexRaw !== "string" || !/^\d+$/.test(chunkIndexRaw)) {
      throw new ApiError(400, "分片索引无效", "UPLOAD_CHUNK_INDEX_INVALID");
    }

    if (!(uploaded instanceof File)) {
      throw new ApiError(400, "缺少分片文件", "FILE_MISSING");
    }

    const secret = getUploadSessionSecret();
    if (!secret) {
      throw new ApiError(
        503,
        "上传会话密钥未配置",
        "UPLOAD_SESSION_SECRET_MISSING",
      );
    }

    const session = verifyUploadSession(sessionToken, secret);

    if (session.roomId !== context.roomId || session.userId !== context.userId) {
      throw new ApiError(403, "上传会话与当前用户或房间不匹配", "UPLOAD_SESSION_MISMATCH");
    }

    const chunkIndex = Number(chunkIndexRaw);
    const expectedBytes = expectedChunkBytes(session, chunkIndex);

    if (uploaded.size !== expectedBytes) {
      throw new ApiError(
        400,
        `分片大小不匹配，应为 ${expectedBytes} 字节`,
        "UPLOAD_CHUNK_SIZE_MISMATCH",
      );
    }

    const fileName = buildChunkFileName({
      fileName: session.fileName,
      index: chunkIndex,
      totalChunks: session.totalChunks,
      service: session.service,
    });
    const body = new Uint8Array(await uploaded.arrayBuffer());
    const sha256 = createHash("sha256").update(body).digest("hex");

    const result =
      session.service === "sang"
        ? await uploadToSang({
            fileName,
            mimeType: session.mimeType,
            body,
            sizeBytes: uploaded.size,
            channel: "icve",
          })
        : await uploadToPicSl({
            fileName,
            mimeType: session.mimeType,
            body,
          });

    const response = jsonOk({
      index: chunkIndex,
      url: result.url,
      sizeBytes: uploaded.size,
      sha256,
    });

    return applyUserCookie(response, context.cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/sessions/chunk failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(normalizeUploadError(error));
  }
}
