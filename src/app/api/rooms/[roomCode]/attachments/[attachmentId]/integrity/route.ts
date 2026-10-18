import type { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { loadAttachmentAccess } from "@/lib/attachment-access";
import { buildAttachmentMergeManifest } from "@/lib/attachment-merge";
import { MAX_ATTACHMENT_CHUNKS } from "@/lib/attachment-storage";
import { applyUserCookie } from "@/lib/identity";
import { normalizeUploadError } from "@/lib/upload/errors";
import { verifyMergedManifest } from "@/lib/upload/merge";

type Params = {
  roomCode: string;
  attachmentId: string;
};

function parseIndexes(value: string | null): number[] | undefined {
  if (value === null || value.trim() === "") {
    return undefined;
  }

  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (
    parts.length === 0 ||
    parts.length > MAX_ATTACHMENT_CHUNKS ||
    !parts.every((part) => /^\d+$/.test(part))
  ) {
    throw new ApiError(400, "分片索引参数无效", "MERGE_VERIFY_INDEX_INVALID");
  }

  return parts.map(Number);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const { roomCode, attachmentId } = await params;
    const access = await loadAttachmentAccess(request, roomCode, attachmentId);
    const manifest = buildAttachmentMergeManifest(access.attachment);
    const indexes = parseIndexes(request.nextUrl.searchParams.get("indexes"));
    const report = await verifyMergedManifest(manifest, { indexes });

    const response = jsonOk({
      ...report,
      attachmentId: access.attachment.id,
      fileName: access.attachment.fileName,
      sizeBytes: manifest.sizeBytes,
      chunkSize: manifest.chunkSize,
      canRepair: access.userId === access.attachment.uploaderId,
    });

    return applyUserCookie(response, access.cookieToSet);
  } catch (error) {
    return jsonError(normalizeUploadError(error));
  }
}
