import {
  UPLOAD_REMOTE_ATTEMPTS,
  UPLOAD_REMOTE_MAX_RETRY_DELAY_MS,
  UPLOAD_REMOTE_RETRY_DELAY_MS,
  UPLOAD_REMOTE_TIMEOUT_MS,
} from "@/lib/upload/constants";

export class RemoteUploadError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status = 502) {
    super(message);
    this.name = "RemoteUploadError";
    this.code = code;
    this.status = status;
  }
}

export type RemoteRetryOptions = {
  attempts?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  retryStatuses?: number[];
};

const DEFAULT_RETRY_STATUSES = [408, 409, 429, 500, 502, 503, 504, 520, 522, 524];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function parseRetryAfter(
  value: string | null,
  maxDelayMs = UPLOAD_REMOTE_MAX_RETRY_DELAY_MS,
): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(maxDelayMs, Math.round(seconds * 1000));
  }

  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return null;
  }

  return Math.min(maxDelayMs, Math.max(0, date - Date.now()));
}

function backoffDelay(attempt: number, baseMs: number, maxMs: number): number {
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1));
}

export async function fetchRemote(
  url: string,
  init: RequestInit,
  options: RemoteRetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? UPLOAD_REMOTE_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? UPLOAD_REMOTE_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? UPLOAD_REMOTE_RETRY_DELAY_MS;
  const maxRetryDelayMs = options.maxRetryDelayMs ?? UPLOAD_REMOTE_MAX_RETRY_DELAY_MS;
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!retryStatuses.includes(response.status) || attempt === attempts) {
        return response;
      }

      await response.body?.cancel().catch(() => undefined);
      const retryAfter = parseRetryAfter(
        response.headers.get("retry-after"),
        maxRetryDelayMs,
      );
      await sleep(retryAfter ?? backoffDelay(attempt, retryDelayMs, maxRetryDelayMs));
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      await sleep(backoffDelay(attempt, retryDelayMs, maxRetryDelayMs));
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "未知网络错误";
  throw new RemoteUploadError(
    `第三方上传服务连接失败：${detail}`,
    "UPLOAD_REMOTE_UNREACHABLE",
    502,
  );
}

export async function readJsonResponse(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function describeRemoteStatus(status: number): string {
  if (status === 413) return "文件超过第三方服务限额";
  if (status === 415) return "第三方服务不支持该文件类型";
  if (status === 429) return "第三方服务繁忙，请稍后重试";
  return `第三方服务返回 HTTP ${status}`;
}
