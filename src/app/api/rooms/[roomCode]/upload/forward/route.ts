import type { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie } from "@/lib/identity";
import { normalizeUploadError } from "@/lib/upload/errors";
import {
  assertUploadFileNameAllowed,
  assertUploadServiceLimit,
  resolveSangChannel,
  resolveUploadService,
  sanitizeUploadFileName,
} from "@/lib/upload/plan";
import { assertDailyUploadQuota } from "@/lib/upload/quota";
import { uploadToPicSl } from "@/lib/upload/remote/pic-sl";
import { uploadToSang } from "@/lib/upload/remote/sang";
import { guardUploadRequest } from "@/lib/upload/route-guard";
import { UPLOAD_SINGLE_REQUEST_MAX_BYTES } from "@/lib/upload/constants";
import { storageForService } from "@/lib/upload/types";

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
        "请使用 multipart/form-data 上传文件",
        "UNSUPPORTED_CONTENT_TYPE",
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiError(400, "无法解析上传内容", "INVALID_MULTIPART");
    }

    const uploaded = formData.get("file");
    if (!(uploaded instanceof File)) {
      throw new ApiError(400, "缺少上传文件", "FILE_MISSING");
    }

    if (uploaded.size <= 0) {
      throw new ApiError(400, "文件大小必须大于 0", "INVALID_FILE_SIZE");
    }

    if (uploaded.size > UPLOAD_SINGLE_REQUEST_MAX_BYTES) {
      throw new ApiError(
        413,
        "文件超过单请求上限（4MB），请改用分片上传",
        "CHUNKED_UPLOAD_REQUIRED",
      );
    }

    const fileName = sanitizeUploadFileName(uploaded.name || `upload-${Date.now()}`);
    const mimeType = uploaded.type?.trim() || "application/octet-stream";
    const service = resolveUploadService(mimeType);

    assertUploadFileNameAllowed(service, fileName);
    assertUploadServiceLimit(service, uploaded.size);
    await assertDailyUploadQuota(context.userId, uploaded.size);

    const body = new Uint8Array(await uploaded.arrayBuffer());
    const result =
      service === "sang"
        ? await uploadToSang({
            fileName,
            mimeType,
            body,
            sizeBytes: uploaded.size,
            channel: resolveSangChannel({
              fileName,
              sizeBytes: uploaded.size,
              chunked: false,
            }),
          })
        : await uploadToPicSl({ fileName, mimeType, body });

    const response = jsonOk({
      service,
      storage: storageForService(service),
      fileName,
      mimeType,
      sizeBytes: uploaded.size,
      url: result.url,
      chunked: false,
    });

    return applyUserCookie(response, context.cookieToSet);
  } catch (error) {
    console.error("[route] /api/rooms/[roomCode]/upload/forward failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(normalizeUploadError(error));
  }
}
