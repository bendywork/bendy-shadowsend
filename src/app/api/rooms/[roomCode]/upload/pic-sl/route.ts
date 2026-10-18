import { AttachmentStorage, RoomStatus } from "@prisma/client";
import { NextRequest } from "next/server";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { applyUserCookie, getOrCreateUser } from "@/lib/identity";
import {
  getFileExtension,
  isPicSlSupportedFileName,
  normalizePicSlMimeType,
  PIC_SL_MAX_FILE_BYTES,
  PIC_SL_MAX_REQUEST_BYTES,
} from "@/lib/pic-sl-rules";
import { PicSlError, picSlClient } from "@/lib/pic-sl";
import { prisma } from "@/lib/prisma";
import { assertRoomMember, cleanupStaleRooms } from "@/lib/room-service";

export const runtime = "nodejs";
// pic.sl.al 服务端往返较慢，给 4MB 单请求留足时间（Vercel 会按套餐上限截断）。
export const maxDuration = 60;

type Params = {
  roomCode: string;
};

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_").slice(0, 180);
}

function readEncodedFileName(request: NextRequest) {
  const encoded = request.headers.get("x-file-name");
  if (!encoded) {
    throw new ApiError(400, "缺少文件名", "PIC_SL_FILE_NAME_MISSING");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(encoded);
  } catch {
    throw new ApiError(400, "文件名编码无效", "PIC_SL_FILE_NAME_INVALID");
  }

  const fileName = sanitizeFileName(decoded.trim());
  if (!fileName) {
    throw new ApiError(400, "文件名不能为空", "PIC_SL_FILE_NAME_INVALID");
  }

  return fileName;
}

function readDeclaredSize(request: NextRequest) {
  const raw = request.headers.get("x-file-size");
  const size = Number(raw);

  if (!raw || !Number.isFinite(size) || size <= 0) {
    throw new ApiError(400, "文件大小无效", "PIC_SL_FILE_SIZE_INVALID");
  }

  return Math.floor(size);
}

function mapPicSlError(error: PicSlError) {
  switch (error.code) {
    case "PIC_SL_UNSUPPORTED_TYPE":
      return new ApiError(
        415,
        "pic.sl.al 不支持该文件类型",
        "PIC_SL_UNSUPPORTED_TYPE",
      );
    case "PIC_SL_FILE_TOO_LARGE":
      return new ApiError(
        413,
        "文件超过 pic.sl.al 200MB 上限",
        "PIC_SL_FILE_TOO_LARGE",
      );
    case "PIC_SL_RATE_LIMITED":
      return new ApiError(
        429,
        "上传服务繁忙，请稍后重试",
        "PIC_SL_RATE_LIMITED",
      );
    case "PIC_SL_TOKEN_INVALID":
    case "PIC_SL_TOKEN_ERROR":
    case "PIC_SL_NETWORK_ERROR":
    case "PIC_SL_INVALID_RESPONSE":
    case "PIC_SL_UPSTREAM_ERROR":
      return new ApiError(
        502,
        "上传服务暂时不可用，请稍后重试",
        error.code,
      );
    default:
      return new ApiError(502, "上传失败，请稍后重试", "PIC_SL_UPSTREAM_ERROR");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    await cleanupStaleRooms();

    const { roomCode } = await params;
    const { user, cookieToSet } = await getOrCreateUser(request);

    const room = await prisma.room.findUnique({
      where: { roomCode },
      select: { id: true, status: true },
    });

    if (!room || room.status !== RoomStatus.ACTIVE) {
      throw new ApiError(404, "房间不存在或已销毁", "ROOM_NOT_FOUND");
    }

    await assertRoomMember(room.id, user.id);

    const fileName = readEncodedFileName(request);
    const mimeType = normalizePicSlMimeType(
      request.headers.get("x-file-type"),
    );
    const declaredSize = readDeclaredSize(request);

    if (!isPicSlSupportedFileName(fileName)) {
      const extension = getFileExtension(fileName) || "未知扩展名";
      throw new ApiError(
        415,
        `pic.sl.al 不支持该文件类型（${extension}）`,
        "PIC_SL_UNSUPPORTED_TYPE",
      );
    }

    if (declaredSize > PIC_SL_MAX_FILE_BYTES) {
      throw new ApiError(
        413,
        "文件超过 pic.sl.al 200MB 上限",
        "PIC_SL_FILE_TOO_LARGE",
      );
    }

    if (declaredSize > PIC_SL_MAX_REQUEST_BYTES) {
      throw new ApiError(
        413,
        "文件超过 4MB，需要走分片上传（up-04 尚未接入）",
        "PIC_SL_CHUNK_REQUIRED",
      );
    }

    const contentLengthHeader = request.headers.get("content-length");
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (
        Number.isFinite(contentLength) &&
        contentLength > PIC_SL_MAX_REQUEST_BYTES
      ) {
        throw new ApiError(
          413,
          "请求体超过 4MB，需要走分片上传（up-04 尚未接入）",
          "PIC_SL_CHUNK_REQUIRED",
        );
      }
    }

    const body = new Uint8Array(await request.arrayBuffer());

    if (body.byteLength <= 0) {
      throw new ApiError(400, "文件内容为空", "PIC_SL_FILE_EMPTY");
    }

    if (body.byteLength > PIC_SL_MAX_REQUEST_BYTES) {
      throw new ApiError(
        413,
        "请求体超过 4MB，需要走分片上传（up-04 尚未接入）",
        "PIC_SL_CHUNK_REQUIRED",
      );
    }

    if (body.byteLength !== declaredSize) {
      throw new ApiError(
        400,
        "文件大小与声明不一致",
        "PIC_SL_FILE_SIZE_MISMATCH",
      );
    }

    const uploaded = await picSlClient.upload({
      fileName,
      mimeType,
      body,
    });

    const response = jsonOk({
      s3Key: uploaded.url,
      fileName,
      mimeType: uploaded.mimeType,
      sizeBytes: body.byteLength,
      storage: AttachmentStorage.PIC_SL,
      previewUrl: null,
    });

    return applyUserCookie(response, cookieToSet);
  } catch (error) {
    if (error instanceof PicSlError) {
      console.error("[route] pic.sl.al upload failed", {
        path: request.nextUrl.pathname,
        method: request.method,
        code: error.code,
        httpStatus: error.httpStatus,
        attempts: error.attempts,
        message: error.message,
      });
      return jsonError(mapPicSlError(error));
    }

    console.error("[route] /api/rooms/[roomCode]/upload/pic-sl failed", {
      path: request.nextUrl.pathname,
      method: request.method,
      error,
    });
    return jsonError(error);
  }
}
