export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

/**
 * Error thrown by `apiFetch`. Keeping the HTTP status and backend error code
 * lets the feedback layer distinguish user-readable business errors from
 * transport/internal failures without parsing message text.
 */
export class ApiRequestError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options?: { status?: number; code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options?.status;
    this.code = options?.code;
    this.details = options?.details;
  }
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const url = typeof input === "string" ? input : input.toString();

  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch (networkError) {
    console.error("[apiFetch] network error", {
      url,
      method,
      error: networkError,
    });
    throw new ApiRequestError(`网络请求失败: ${method} ${url}`, {
      code: "NETWORK_ERROR",
    });
  }

  let rawText = "";
  try {
    rawText = await response.text();
  } catch (readError) {
    console.error("[apiFetch] response read error", {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      error: readError,
    });
    throw new ApiRequestError(`读取响应失败: ${method} ${url}`, {
      code: "NETWORK_ERROR",
    });
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = rawText ? (JSON.parse(rawText) as ApiEnvelope<T>) : null;
  } catch (parseError) {
    console.error("[apiFetch] response parse error", {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      rawText,
      error: parseError,
    });
    throw new ApiRequestError(`解析响应失败: ${method} ${url}`, {
      code: "INVALID_RESPONSE",
    });
  }

  if (!response.ok || !payload?.ok || typeof payload.data === "undefined") {
    console.error("[apiFetch] request failed", {
      url,
      method,
      status: response.status,
      statusText: response.statusText,
      payload,
      rawText,
    });
    throw new ApiRequestError(payload?.error?.message ?? "请求失败", {
      status: response.status,
      code: payload?.error?.code ?? `HTTP_${response.status}`,
      details: payload?.error?.details,
    });
  }

  return payload.data;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

