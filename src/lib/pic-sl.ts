import { APP_VERSION } from "@/lib/constants";
import {
  buildPicSlRemoteFileName,
  isPicSlSupportedFileName,
  normalizePicSlMimeType,
  normalizePicSlPublicUrl,
  PIC_SL_BASE_URL,
  PIC_SL_MAX_FILE_BYTES,
} from "@/lib/pic-sl-rules";

/**
 * pic.sl.al 服务端上传封装。
 *
 * 协议要点（2026-10-13 实测）：
 * 1. POST /api/upload-token：需要 Referer + X-Requested-With，返回 JWT 与
 *    __Host-imgsess cookie；JWT 与 User-Agent 绑定。
 * 2. POST /api/upload：原始文件体 + X-Filename + X-Upload-Token。
 *
 * 实测发现 token 是一次性的：同 token 第二次上传返回 403。因此这里的
 * 「缓存」是单次令牌槽位（取走即失效），并预取下一枚令牌降低延迟；
 * 真正可跨请求复用的是 __Host-imgsess cookie。
 */

export const PIC_SL_MAX_UPLOAD_ATTEMPTS = 3;
export const PIC_SL_TOKEN_TIMEOUT_MS = 15_000;
export const PIC_SL_UPLOAD_TIMEOUT_MS = 45_000;
export const PIC_SL_MAX_RETRY_DELAY_MS = 10_000;
export const PIC_SL_TOKEN_EXPIRY_MARGIN_MS = 5_000;

const RETRYABLE_STATUS_CODES = new Set([
  408, 409, 429, 500, 502, 503, 504, 520, 522, 524,
]);

const TOKEN_INVALID_STATUS_CODES = new Set([401, 403]);

export type PicSlErrorCode =
  | "PIC_SL_NETWORK_ERROR"
  | "PIC_SL_TOKEN_ERROR"
  | "PIC_SL_TOKEN_INVALID"
  | "PIC_SL_RATE_LIMITED"
  | "PIC_SL_UPSTREAM_ERROR"
  | "PIC_SL_INVALID_RESPONSE"
  | "PIC_SL_UNSUPPORTED_TYPE"
  | "PIC_SL_FILE_TOO_LARGE";

export class PicSlError extends Error {
  code: PicSlErrorCode;
  httpStatus: number | null;
  retryable: boolean;
  retryAfterMs: number | null;
  attempts: number;

  constructor(
    message: string,
    options: {
      code: PicSlErrorCode;
      httpStatus?: number | null;
      retryable: boolean;
      retryAfterMs?: number | null;
      attempts?: number;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PicSlError";
    this.code = options.code;
    this.httpStatus = options.httpStatus ?? null;
    this.retryable = options.retryable;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.attempts = options.attempts ?? 1;
  }
}

export type PicSlUploadInput = {
  fileName: string;
  mimeType: string;
  body: Uint8Array;
};

export type PicSlUploadResult = {
  url: string;
  remoteFileName: string;
  fileId: string | null;
  path: string | null;
  sizeBytes: number;
  mimeType: string;
  attempts: number;
};

type CachedToken = {
  token: string;
  expiresAt: number;
};

type TokenPayload = {
  ok?: boolean;
  token?: unknown;
  expires_in?: unknown;
  message?: unknown;
  error?: unknown;
};

type UploadPayload = {
  success?: boolean;
  code?: unknown;
  message?: unknown;
  error?: unknown;
  data?: {
    url?: unknown;
    file_id?: unknown;
    path?: unknown;
    size?: unknown;
    type?: unknown;
    filename?: unknown;
  } | null;
};

type PicSlClientOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  prefetchTokens?: boolean;
  userAgent?: string;
};

function defaultSleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function isRetryableStatus(status: number) {
  return RETRYABLE_STATUS_CODES.has(status);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const candidate = payload as { error?: unknown; message?: unknown };
  const value =
    typeof candidate.error === "string"
      ? candidate.error
      : typeof candidate.message === "string"
        ? candidate.message
        : "";
  return value.trim().slice(0, 200) || fallback;
}

function parseJsonPayload(rawText: string): unknown {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return null;
  }
}

function captureCookies(headers: Headers, jar: Map<string, string>) {
  const headerWithGetter = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookieValues =
    typeof headerWithGetter.getSetCookie === "function"
      ? headerWithGetter.getSetCookie()
      : [headers.get("set-cookie") ?? ""];

  for (const raw of setCookieValues) {
    if (!raw) continue;
    const firstPart = raw.split(";")[0] ?? "";
    const separatorIndex = firstPart.indexOf("=");
    if (separatorIndex > 0) {
      jar.set(
        firstPart.slice(0, separatorIndex).trim(),
        firstPart.slice(separatorIndex + 1).trim(),
      );
      continue;
    }

    // 某些运行时会合并多个 Set-Cookie；兜底提取关键会话 cookie。
    const match = raw.match(/__Host-imgsess=([^;,\s]+)/);
    if (match) {
      jar.set("__Host-imgsess", match[1]);
    }
  }
}

function buildCookieHeader(jar: Map<string, string>) {
  return Array.from(jar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export function parseRetryAfterMs(
  value: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed) * 1000, PIC_SL_MAX_RETRY_DELAY_MS);
  }

  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return null;

  return Math.max(
    0,
    Math.min(timestamp - nowMs, PIC_SL_MAX_RETRY_DELAY_MS),
  );
}

export class PicSlClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly prefetchTokens: boolean;
  private readonly userAgent: string;

  private readonly cookieJar = new Map<string, string>();
  private cachedToken: CachedToken | null = null;
  private prefetchInFlight: Promise<void> | null = null;

  constructor(options: PicSlClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.prefetchTokens = options.prefetchTokens ?? true;
    this.userAgent =
      options.userAgent ??
      `BendyShadowSend/${APP_VERSION} (+https://bendy-shadowsend.vercel.app)`;
  }

  async upload(input: PicSlUploadInput): Promise<PicSlUploadResult> {
    if (input.body.byteLength <= 0) {
      throw new PicSlError("文件内容为空", {
        code: "PIC_SL_UPSTREAM_ERROR",
        retryable: false,
      });
    }

    if (input.body.byteLength > PIC_SL_MAX_FILE_BYTES) {
      throw new PicSlError("文件超过 pic.sl.al 200MB 上限", {
        code: "PIC_SL_FILE_TOO_LARGE",
        retryable: false,
      });
    }

    if (!isPicSlSupportedFileName(input.fileName)) {
      throw new PicSlError("pic.sl.al 不支持该文件扩展名", {
        code: "PIC_SL_UNSUPPORTED_TYPE",
        retryable: false,
      });
    }

    const mimeType = normalizePicSlMimeType(input.mimeType);
    const remoteFileName = buildPicSlRemoteFileName(
      input.fileName,
      this.now(),
      this.random,
    );

    let lastError: PicSlError | null = null;

    for (let attempt = 1; attempt <= PIC_SL_MAX_UPLOAD_ATTEMPTS; attempt += 1) {
      try {
        const token = await this.takeToken();
        return await this.performUpload({
          token,
          body: input.body,
          mimeType,
          remoteFileName,
          attempt,
        });
      } catch (error) {
        const picSlError =
          error instanceof PicSlError
            ? error
            : new PicSlError("pic.sl.al 网络请求失败", {
                code: "PIC_SL_NETWORK_ERROR",
                retryable: true,
                cause: error,
              });

        picSlError.attempts = attempt;
        lastError = picSlError;

        if (!picSlError.retryable || attempt >= PIC_SL_MAX_UPLOAD_ATTEMPTS) {
          throw picSlError;
        }

        const delay =
          picSlError.retryAfterMs ??
          Math.min(
            PIC_SL_MAX_RETRY_DELAY_MS,
            300 * 2 ** (attempt - 1),
          );
        await this.sleep(delay);
      }
    }

    throw (
      lastError ??
      new PicSlError("pic.sl.al 上传失败", {
        code: "PIC_SL_UPSTREAM_ERROR",
        retryable: false,
      })
    );
  }

  private async takeToken(): Promise<string> {
    const cached = this.cachedToken;
    if (
      cached &&
      cached.expiresAt - this.now() > PIC_SL_TOKEN_EXPIRY_MARGIN_MS
    ) {
      this.cachedToken = null;
      this.schedulePrefetch();
      return cached.token;
    }

    this.cachedToken = null;
    const fresh = await this.fetchToken();
    this.schedulePrefetch();
    return fresh.token;
  }

  private schedulePrefetch() {
    if (!this.prefetchTokens || this.cachedToken || this.prefetchInFlight) {
      return;
    }

    this.prefetchInFlight = this.fetchToken()
      .then((token) => {
        if (!this.cachedToken) {
          this.cachedToken = token;
        }
      })
      .catch((error) => {
        console.warn("[pic-sl] token prefetch failed", {
          error: error instanceof Error ? error.message : error,
        });
      })
      .finally(() => {
        this.prefetchInFlight = null;
      });
  }

  private async fetchToken(): Promise<CachedToken> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      Referer: `${PIC_SL_BASE_URL}/`,
      Origin: PIC_SL_BASE_URL,
      "User-Agent": this.userAgent,
      "X-Requested-With": "XMLHttpRequest",
    };
    const cookieHeader = buildCookieHeader(this.cookieJar);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${PIC_SL_BASE_URL}/api/upload-token`, {
        method: "POST",
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(PIC_SL_TOKEN_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PicSlError("无法连接 pic.sl.al 获取上传令牌", {
        code: "PIC_SL_NETWORK_ERROR",
        retryable: true,
        cause: error,
      });
    }

    captureCookies(response.headers, this.cookieJar);

    const rawText = await response.text().catch(() => "");
    const payload = parseJsonPayload(rawText) as TokenPayload | null;

    if (
      !response.ok ||
      !payload ||
      payload.ok !== true ||
      typeof payload.token !== "string" ||
      payload.token.length === 0
    ) {
      const retryable = response.ok || isRetryableStatus(response.status);
      throw new PicSlError(
        readErrorMessage(payload, `获取 pic.sl.al 上传令牌失败（HTTP ${response.status}）`),
        {
          code:
            response.status === 429
              ? "PIC_SL_RATE_LIMITED"
              : "PIC_SL_TOKEN_ERROR",
          httpStatus: response.status,
          retryable,
          retryAfterMs: parseRetryAfterMs(
            response.headers.get("retry-after"),
            this.now(),
          ),
        },
      );
    }

    const expiresIn =
      typeof payload.expires_in === "number" && payload.expires_in > 0
        ? payload.expires_in
        : 600;

    return {
      token: payload.token,
      expiresAt: this.now() + expiresIn * 1000,
    };
  }

  private async performUpload(params: {
    token: string;
    body: Uint8Array;
    mimeType: string;
    remoteFileName: string;
    attempt: number;
  }): Promise<PicSlUploadResult> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": params.mimeType,
      Origin: PIC_SL_BASE_URL,
      Referer: `${PIC_SL_BASE_URL}/`,
      "User-Agent": this.userAgent,
      "X-Filename": params.remoteFileName,
      "X-Requested-With": "XMLHttpRequest",
      "X-Upload-Token": params.token,
    };
    const cookieHeader = buildCookieHeader(this.cookieJar);
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const requestBody = params.body.buffer.slice(
      params.body.byteOffset,
      params.body.byteOffset + params.body.byteLength,
    ) as ArrayBuffer;

    let response: Response;
    try {
      response = await this.fetchImpl(`${PIC_SL_BASE_URL}/api/upload`, {
        method: "POST",
        headers,
        body: requestBody,
        cache: "no-store",
        signal: AbortSignal.timeout(PIC_SL_UPLOAD_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PicSlError("pic.sl.al 上传请求失败", {
        code: "PIC_SL_NETWORK_ERROR",
        retryable: true,
        cause: error,
      });
    }

    const rawText = await response.text().catch(() => "");
    const payload = parseJsonPayload(rawText) as UploadPayload | null;
    const dataUrl =
      payload && typeof payload.data?.url === "string" ? payload.data.url : null;

    if (!response.ok || payload?.success !== true || !dataUrl) {
      const status = response.status;
      const isTokenInvalid = TOKEN_INVALID_STATUS_CODES.has(status);
      const retryable =
        isTokenInvalid || isRetryableStatus(status) || response.ok;

      let code: PicSlErrorCode = "PIC_SL_UPSTREAM_ERROR";
      if (status === 415) {
        code = "PIC_SL_UNSUPPORTED_TYPE";
      } else if (status === 413) {
        code = "PIC_SL_FILE_TOO_LARGE";
      } else if (isTokenInvalid) {
        code = "PIC_SL_TOKEN_INVALID";
      } else if (status === 429) {
        code = "PIC_SL_RATE_LIMITED";
      }

      throw new PicSlError(
        readErrorMessage(payload, `pic.sl.al 上传失败（HTTP ${status}）`),
        {
          code,
          httpStatus: status,
          retryable: retryable && status !== 413 && status !== 415,
          retryAfterMs: parseRetryAfterMs(
            response.headers.get("retry-after"),
            this.now(),
          ),
        },
      );
    }

    const normalizedUrl = normalizePicSlPublicUrl(dataUrl);
    if (!normalizedUrl) {
      throw new PicSlError("pic.sl.al 返回了非法的文件地址", {
        code: "PIC_SL_INVALID_RESPONSE",
        httpStatus: response.status,
        retryable: true,
      });
    }

    const data = payload.data;
    return {
      url: normalizedUrl,
      remoteFileName: params.remoteFileName,
      fileId: typeof data?.file_id === "string" ? data.file_id : null,
      path: typeof data?.path === "string" ? data.path : null,
      sizeBytes:
        typeof data?.size === "number" && Number.isFinite(data.size)
          ? data.size
          : params.body.byteLength,
      mimeType:
        typeof data?.type === "string" && data.type
          ? data.type
          : params.mimeType,
      attempts: params.attempt,
    };
  }
}

export const picSlClient = new PicSlClient();
