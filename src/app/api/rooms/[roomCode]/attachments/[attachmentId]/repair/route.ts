import { createHash } from "node:crypto";

import type { NextRequest } from "next/server";

import { ApiError, jsonError, jsonOk } from "@/lib/api";
import {
  loadAttachmentAccess,
  type AttachmentAccess,
} from "@/lib/attachment-access";
import {
  buildAttachmentMergeManifest,
  type BuildableAttachment,
} from "@/lib/attachment-merge";
import {
  parseAttachmentChunkManifest,
  type AttachmentChunkManifest,
} from "@/lib/attachment-storage";
import { getUploadSessionSecret } from "@/lib/env";
import { applyUserCookie } from "@/lib/identity";
import { prisma } from "@/lib/prisma";
import { normalizeUploadError } from "@/lib/upload/errors";
import { manifestIntegrity } from "@/lib/upload/hash";
import { buildMergeUrl, signMergeToken } from "@/lib/upload/merge";
import { buildChunkFileName } from "@/lib/upload/plan";
import { assertUploadRateLimit } from "@/lib/upload/rate-limit";
import { uploadToPicSl } from "@/lib/upload/remote/pic-sl";
import { uploadToSang } from "@/lib/upload/remote/sang";
import { assertUploadOrigin } from "@/lib/upload/route-guard";
import type { UploadManifest } from "@/lib/upload/types";

type Params = {
  roomCode: string;
  attachmentId: string;
};

type RepairForm = {
  index: number;
  file: File;
};

type RepairBytes = {
  body: Uint8Array<ArrayBuffer>;
  sha256: string;
  hashesEnabled: boolean;
};

function parseRepairForm(formData: FormData): RepairForm {
  const indexRaw = formData.get("index");
  const file = formData.get("file");

  if (typeof indexRaw !== "string" || !/^\d+$/.test(indexRaw)) {
    throw new ApiError(400, "分片索引无效", "REPAIR_CHUNK_INDEX_INVALID");
  }

  if (!(file instanceof File)) {
    throw new ApiError(400, "缺少补传分片文件", "REPAIR_FILE_MISSING");
  }

  return { index: Number(indexRaw), file };
}

async function readRepairBytes(
  manifest: AttachmentChunkManifest,
  form: RepairForm,
): Promise<RepairBytes> {
  const target = manifest.chunks[form.index];
  if (!target) {
    throw new ApiError(400, "分片索引超出范围", "REPAIR_CHUNK_INDEX_INVALID");
  }

  if (form.file.size !== target.sizeBytes) {
    throw new ApiError(
      400,
      `分片大小不匹配，应为 ${target.sizeBytes} 字节`,
      "REPAIR_CHUNK_SIZE_MISMATCH",
    );
  }

  const body = new Uint8Array(await form.file.arrayBuffer());
  const sha256 = createHash("sha256").update(body).digest("hex");
  const hashesEnabled = manifest.chunks.every((chunk) => chunk.sha256);

  if (hashesEnabled && sha256 !== target.sha256) {
    throw new ApiError(
      400,
      "补传分片与原文件 SHA-256 不一致",
      "REPAIR_CHUNK_HASH_MISMATCH",
    );
  }

  return { body, sha256, hashesEnabled };
}

async function uploadRepairChunk(
  manifest: UploadManifest,
  form: RepairForm,
  body: Uint8Array<ArrayBuffer>,
) {
  const fileName = buildChunkFileName({
    fileName: manifest.fileName,
    index: form.index,
    totalChunks: manifest.totalChunks,
    service: manifest.service,
  });

  return manifest.service === "sang"
    ? uploadToSang({
        fileName,
        mimeType: manifest.mimeType,
        body,
        sizeBytes: form.file.size,
        channel: "icve",
      })
    : uploadToPicSl({
        fileName,
        mimeType: manifest.mimeType,
        body,
      });
}

function buildUpdatedManifest(
  access: AttachmentAccess,
  manifest: AttachmentChunkManifest,
  form: RepairForm,
  uploaded: { url: string },
  bytes: RepairBytes,
) {
  const nextChunks = manifest.chunks.map((chunk, index) =>
    index === form.index
      ? {
          index,
          url: uploaded.url,
          sizeBytes: form.file.size,
          ...(bytes.hashesEnabled ? { sha256: bytes.sha256 } : {}),
        }
      : chunk,
  );
  const raw = access.attachment.chunkManifest;
  const base =
    typeof raw === "object" && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const chunkManifest = { ...base, chunks: nextChunks };
  const updatedAttachment = { ...access.attachment, chunkManifest };

  return {
    chunkManifest,
    updatedMergeManifest: buildAttachmentMergeManifest(
      updatedAttachment as BuildableAttachment,
    ),
  };
}

function signRepairUrl(
  roomCode: string,
  roomId: string,
  manifest: UploadManifest,
): string {
  const secret = getUploadSessionSecret();
  if (!secret) {
    throw new ApiError(503, "合并下载密钥未配置", "MERGE_SECRET_MISSING");
  }

  return buildMergeUrl(
    roomCode,
    signMergeToken({ roomId, manifest }, secret),
  );
}

function assertRepairAllowed(access: AttachmentAccess): void {
  if (access.userId !== access.attachment.uploaderId) {
    throw new ApiError(403, "只有原上传者可以补传分片", "REPAIR_FORBIDDEN");
  }
}

function assertMultipart(request: NextRequest): void {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    throw new ApiError(
      415,
      "请使用 multipart/form-data 补传分片",
      "UNSUPPORTED_CONTENT_TYPE",
    );
  }
}

async function parseMultipart(request: NextRequest): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw new ApiError(400, "无法解析补传内容", "INVALID_MULTIPART");
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    assertUploadOrigin(request);

    const { roomCode, attachmentId } = await params;
    const access = await loadAttachmentAccess(request, roomCode, attachmentId);
    assertUploadRateLimit(access.userId);
    assertRepairAllowed(access);
    assertMultipart(request);

    const manifest = parseAttachmentChunkManifest(
      access.attachment.chunkManifest,
      access.attachment.storage,
    );
    if (!manifest) {
      throw new ApiError(
        409,
        "该附件没有可补传的分片清单",
        "REPAIR_MANIFEST_INVALID",
      );
    }

    const form = parseRepairForm(await parseMultipart(request));
    const bytes = await readRepairBytes(manifest, form);
    const mergeManifest = buildAttachmentMergeManifest(
      access.attachment as BuildableAttachment,
    );
    const uploaded = await uploadRepairChunk(mergeManifest, form, bytes.body);
    const { chunkManifest, updatedMergeManifest } = buildUpdatedManifest(
      access,
      manifest,
      form,
      uploaded,
      bytes,
    );
    const mergeUrl = signRepairUrl(
      roomCode,
      access.roomId,
      updatedMergeManifest,
    );

    await prisma.messageAttachment.update({
      where: { id: access.attachment.id },
      data: {
        chunkManifest,
        ...(form.index === 0 ? { s3Key: uploaded.url } : {}),
      },
    });

    const response = jsonOk({
      index: form.index,
      url: uploaded.url,
      sizeBytes: form.file.size,
      sha256: bytes.sha256,
      integrity: manifestIntegrity(updatedMergeManifest.chunks),
      mergeUrl,
    });

    return applyUserCookie(response, access.cookieToSet);
  } catch (error) {
    return jsonError(normalizeUploadError(error));
  }
}
