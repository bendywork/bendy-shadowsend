import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import {
  isRemoteFileUrl, remoteAttachmentSchema, type RemoteAttachment, UPLOAD_CHUNK_BYTES,
} from "@/lib/attachment-storage";

type StoredAttachment = {
  s3Key: string; storage: string; fileName: string; mimeType: string;
  sizeBytes: number | bigint; chunkManifest?: unknown;
};
type Part = { index: number; url: string; sizeBytes: number; sha256?: string };

export function resolveRemoteAttachment(stored: StoredAttachment): RemoteAttachment {
  if (stored.storage !== "REMOTE") {
    throw new ApiError(410, "该附件使用已停用的存储，请重新上传", "ATTACHMENT_STORAGE_RETIRED");
  }
  const parsed = remoteAttachmentSchema.safeParse({ ...stored, sizeBytes: Number(stored.sizeBytes) });
  if (!parsed.success) throw new ApiError(409, "附件地址或分片清单无效", "ATTACHMENT_INVALID");
  return parsed.data;
}

export function parseByteRange(header: string | null | undefined, size: number) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return null;
  let start: number;
  let end: number;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }
  return { start, end, partial: true };
}

async function readPart(part: Part, fetchImpl: typeof fetch, signal: AbortSignal): Promise<Buffer> {
  let url = part.url;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (!isRemoteFileUrl(url)) throw new ApiError(502, "文件下载地址无效", "ATTACHMENT_URL_INVALID");
    response = await fetchImpl(url, {
      redirect: "manual", cache: "no-store", signal,
      headers: { "Accept-Encoding": "identity" },
    });
    if (response.url && !isRemoteFileUrl(response.url)) {
      await response.body?.cancel();
      throw new ApiError(502, "文件下载重定向无效", "ATTACHMENT_REDIRECT_INVALID");
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects === 3) throw new ApiError(502, "文件下载重定向无效", "ATTACHMENT_REDIRECT_INVALID");
    url = new URL(location, url).href;
    if (!isRemoteFileUrl(url)) throw new ApiError(502, "文件下载重定向无效", "ATTACHMENT_REDIRECT_INVALID");
  }
  if (!response?.ok || !response.body) throw new ApiError(502, `文件分片 ${part.index + 1} 下载失败`, "ATTACHMENT_FETCH_FAILED");
  const contentLength = response.headers.get("content-length");
  if (contentLength !== null && Number(contentLength) !== part.sizeBytes) {
    await response.body.cancel();
    throw new ApiError(502, `文件分片 ${part.index + 1} 大小不一致`, "ATTACHMENT_SIZE_MISMATCH");
  }
  const reader = response.body.getReader();
  const buffers: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > part.sizeBytes) throw new ApiError(502, "文件分片超出预期大小", "ATTACHMENT_SIZE_MISMATCH");
      buffers.push(value);
    }
    if (received !== part.sizeBytes) throw new ApiError(502, "文件分片不完整", "ATTACHMENT_SIZE_MISMATCH");
    const buffer = Buffer.concat(buffers, received);
    if (part.sha256 && createHash("sha256").update(buffer).digest("hex") !== part.sha256) {
      throw new ApiError(502, `文件分片 ${part.index + 1} 完整性校验失败`, "ATTACHMENT_HASH_MISMATCH");
    }
    return buffer;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function contentDisposition(fileName: string, disposition: "inline" | "attachment") {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/** Buffer at most one validated part, then stream under backpressure; never buffer the full file. */
export async function createRemoteAttachmentResponse(stored: StoredAttachment, options: {
  disposition: "inline" | "attachment"; range?: string | null;
  signal?: AbortSignal; fetchImpl?: typeof fetch;
}) {
  const attachment = resolveRemoteAttachment(stored);
  const range = parseByteRange(options.range, attachment.sizeBytes);
  if (!range) {
    return new NextResponse(null, { status: 416, headers: {
      "Content-Range": `bytes */${attachment.sizeBytes}`, "Cache-Control": "private, no-store",
    } });
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const cleanup = () => options.signal?.removeEventListener("abort", abort);
  const parts: Part[] = attachment.chunkManifest?.chunks ?? [{ index: 0, url: attachment.s3Key, sizeBytes: attachment.sizeBytes }];
  const chunkSize = attachment.chunkManifest ? UPLOAD_CHUNK_BYTES : attachment.sizeBytes;
  let index = Math.floor(range.start / chunkSize);
  const lastIndex = Math.floor(range.end / chunkSize);
  const read = async (part: Part) => {
    try {
      return await readPart(part, options.fetchImpl ?? fetch,
        AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]));
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, "文件下载中断，请重试", "ATTACHMENT_FETCH_FAILED");
    }
  };
  let pending: Buffer | undefined;
  try { pending = await read(parts[index]); }
  catch (error) { cleanup(); controller.abort(); throw error; }

  const stream = new ReadableStream<Uint8Array>({
    async pull(output) {
      try {
        if (controller.signal.aborted) throw new Error("Download aborted");
        const buffer = pending ?? await read(parts[index]);
        pending = undefined;
        const offset = index * chunkSize;
        output.enqueue(new Uint8Array(buffer.subarray(Math.max(0, range.start - offset), Math.min(buffer.length, range.end - offset + 1))));
        index += 1;
        if (index > lastIndex) { output.close(); cleanup(); }
      } catch (error) { output.error(error); controller.abort(); cleanup(); }
    },
    cancel() { controller.abort(); cleanup(); pending = undefined; },
  });
  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType,
    "Content-Length": String(range.end - range.start + 1),
    "Content-Disposition": contentDisposition(attachment.fileName, options.disposition),
    "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (range.partial) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${attachment.sizeBytes}`;
  if (options.disposition === "inline") headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
  return new NextResponse(stream, { status: range.partial ? 206 : 200, headers });
}
