export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
  };
};

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const url = typeof input === "string" ? input : input.toString();

  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
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
    throw new Error(`网络请求失败: ${method} ${url}`);
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
    throw new Error(`读取响应失败: ${method} ${url}`);
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
    throw new Error(`解析响应失败: ${method} ${url}`);
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
    throw new Error(payload?.error?.message ?? "请求失败");
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

