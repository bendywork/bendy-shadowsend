import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import {
  isAllowedSangUrl,
  isRetryableSangStatus,
  selectSangChannel,
  type SangChannel,
} from "@/lib/upload-rules";

export const SANG_MAX_ATTEMPTS = 3;
export const SANG_REQUEST_TIMEOUT_MS = 8_000;
const RETRY_DELAYS_MS = [400, 900] as const;

export type SangUploadParams = {
  fileName: string;
  mimeType: string;
  body: Uint8Array;
  sizeBytes?: number;
};

export type SangUploadOptions = {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
};

export type SangUploadResult = {
  url: string;
  channel: SangChannel;
};

export type ParsedSangResponse =
  | { ok: true; url: string }
  | { ok: false; retryable: boolean; message: string };

type SangAttemptResult =
  | { kind: "success"; url: string }
  | { kind: "retry"; reason: string }
  | { kind: "fail"; message: string };

type PreparedSangUpload = {
  channel: SangChannel;
  sizeBytes: number;
  headers: Record<string, string>;
};

export function buildSangHeaders(params: {
  channel: SangChannel;
  fileName: string;
  sizeBytes: number;
}): Record<string, string> {
  return {
    "X-Upload-Type": params.channel,
    "X-File-Name": encodeURIComponent(params.fileName),
    "X-File-Size": String(params.sizeBytes),
    "Content-Type": "application/octet-stream",
  };
}

export function parseSangResponse(rawText: string): ParsedSangResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      retryable: true,
      message: "file.sang.pub 返回了无法解析的响应",
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      ok: false,
      retryable: true,
      message: "file.sang.pub 返回了空响应",
    };
  }

  const payload = parsed as { code?: unknown; msg?: unknown; data?: unknown };
  const code = typeof payload.code === "number" ? payload.code : Number.NaN;

  if (code !== 200) {
    const upstreamMessage =
      typeof payload.msg === "string" && payload.msg.trim()
        ? payload.msg.trim().slice(0, 200)
        : "未知错误";
    return {
      ok: false,
      retryable: isRetryableSangStatus(code) || code >= 500,
      message: `file.sang.pub 上传失败：${upstreamMessage}`,
    };
  }

  if (typeof payload.data !== "string" || !isAllowedSangUrl(payload.data)) {
    return {
      ok: false,
      retryable: false,
      message: "file.sang.pub 未返回有效的文件 URL",
    };
  }

  return { ok: true, url: payload.data };
}

function defaultSleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(attempt: number) {
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
}

function prepareSangUpload(params: SangUploadParams): PreparedSangUpload {
  const sizeBytes = params.sizeBytes ?? params.body.byteLength;

  if (sizeBytes !== params.body.byteLength) {
    throw new ApiError(400, "文件大小与上传内容不一致", "SANG_SIZE_MISMATCH");
  }

  const channel = selectSangChannel({
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes,
  });

  if (!channel) {
    throw new ApiError(
      400,
      "图片格式或大小超出 file.sang.pub 通道限制（meitu ≤20MB / icve ≤100MB）",
      "SANG_CHANNEL_UNSUPPORTED",
    );
  }

  return {
    channel,
    sizeBytes,
    headers: buildSangHeaders({
      channel,
      fileName: params.fileName,
      sizeBytes,
    }),
  };
}

async function performSangAttempt(input: {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array;
  fetchImpl: typeof fetch;
}): Promise<SangAttemptResult> {
  try {
    const response = await input.fetchImpl(input.endpoint, {
      method: "POST",
      headers: input.headers,
      body: Buffer.from(input.body),
      cache: "no-store",
      signal: AbortSignal.timeout(SANG_REQUEST_TIMEOUT_MS),
    });
    const rawText = await response.text();

    if (!response.ok) {
      return isRetryableSangStatus(response.status)
        ? { kind: "retry", reason: `HTTP ${response.status}` }
        : {
            kind: "fail",
            message: `file.sang.pub 上传失败（HTTP ${response.status}）`,
          };
    }

    const parsed = parseSangResponse(rawText);

    if (parsed.ok) {
      return { kind: "success", url: parsed.url };
    }

    return parsed.retryable
      ? { kind: "retry", reason: parsed.message }
      : { kind: "fail", message: parsed.message };
  } catch (error) {
    return {
      kind: "retry",
      reason: error instanceof Error ? error.message : "network error",
    };
  }
}

export async function uploadToSang(
  params: SangUploadParams,
  options: SangUploadOptions = {},
): Promise<SangUploadResult> {
  const prepared = prepareSangUpload(params);
  const endpoint = options.endpoint ?? env.sang.uploadUrl;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = Math.max(1, options.maxAttempts ?? SANG_MAX_ATTEMPTS);
  const sleep = options.sleep ?? defaultSleep;
  let lastReason = "未知错误";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await performSangAttempt({
      endpoint,
      headers: prepared.headers,
      body: params.body,
      fetchImpl,
    });

    if (result.kind === "success") {
      return { url: result.url, channel: prepared.channel };
    }

    if (result.kind === "fail") {
      throw new ApiError(502, result.message, "SANG_UPLOAD_FAILED");
    }

    lastReason = result.reason;

    if (attempt < maxAttempts) {
      console.warn("[sang] upload retry", {
        attempt,
        channel: prepared.channel,
        sizeBytes: prepared.sizeBytes,
        reason: result.reason,
      });
      await sleep(retryDelayMs(attempt));
    }
  }

  console.error("[sang] upload failed after retries", {
    channel: prepared.channel,
    sizeBytes: prepared.sizeBytes,
    attempts: maxAttempts,
    lastReason,
  });

  throw new ApiError(
    502,
    "file.sang.pub 上传失败，请稍后重试",
    "SANG_UPLOAD_FAILED",
  );
}
