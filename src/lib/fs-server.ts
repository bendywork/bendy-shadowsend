import { env, isFsServerConfigured } from "@/lib/env";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }

  const resp = await fetch(`${env.fsServer.address}/api/t/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: env.fsServer.apiKey,
      api_secret: env.fsServer.apiSecret,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FS Server auth failed (${resp.status}): ${await resp.text()}`);
  }

  const body = (await resp.json()) as {
    success: boolean;
    data?: { access_token: string; expires_in: number };
  };

  if (!body.success || !body.data?.access_token) {
    throw new Error("FS Server auth returned unexpected response");
  }

  tokenCache = {
    token: body.data.access_token,
    expiresAt: Date.now() + (body.data.expires_in ?? 3600) * 1000,
  };

  return tokenCache.token;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function createUploadUrl(params: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const token = await getAccessToken();
  const resp = await fetch(`${env.fsServer.address}/api/t/presign-upload`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      key: params.key,
      content_type: params.contentType,
      expires_in_seconds: params.expiresInSeconds,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FS Server presign-upload failed (${resp.status})`);
  }

  const body = (await resp.json()) as {
    success: boolean;
    data?: { url: string };
  };

  if (!body.success || !body.data?.url) {
    throw new Error("FS Server presign-upload: no URL returned");
  }

  return body.data.url;
}

export async function uploadObject(params: {
  key: string;
  contentType: string;
  body: Uint8Array;
}): Promise<void> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append("key", params.key);
  form.append(
    "file",
    new Blob([params.body], { type: params.contentType }),
  );

  const resp = await fetch(`${env.fsServer.address}/api/t/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!resp.ok) {
    throw new Error(`FS Server upload failed (${resp.status})`);
  }
}

export async function createDownloadUrl(params: {
  key: string;
  filename: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const token = await getAccessToken();
  const resp = await fetch(`${env.fsServer.address}/api/t/presign-download`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      key: params.key,
      filename: params.filename,
      expires_in_seconds: params.expiresInSeconds,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FS Server presign-download failed (${resp.status})`);
  }

  const body = (await resp.json()) as {
    success: boolean;
    data?: { url: string };
  };

  if (!body.success || !body.data?.url) {
    throw new Error("FS Server presign-download: no URL returned");
  }

  return body.data.url;
}

export async function createInlineReadUrl(params: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const token = await getAccessToken();
  const resp = await fetch(`${env.fsServer.address}/api/t/presign-download`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      key: params.key,
      expires_in_seconds: params.expiresInSeconds,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FS Server presign-download (inline) failed (${resp.status})`);
  }

  const body = (await resp.json()) as {
    success: boolean;
    data?: { url: string };
  };

  if (!body.success || !body.data?.url) {
    throw new Error("FS Server presign-download (inline): no URL returned");
  }

  return body.data.url;
}

export async function createAttachmentPreviewUrl(params: {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<string> {
  const token = await getAccessToken();
  const resp = await fetch(`${env.fsServer.address}/api/t/oss-preview`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      key: params.key,
      file_name: params.fileName,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
    }),
  });

  if (!resp.ok) {
    throw new Error(`FS Server oss-preview failed (${resp.status})`);
  }

  const body = (await resp.json()) as {
    success: boolean;
    data?: { url?: string };
  };

  if (!body.success) {
    throw new Error("FS Server oss-preview returned error");
  }

  return body.data?.url ?? "";
}
