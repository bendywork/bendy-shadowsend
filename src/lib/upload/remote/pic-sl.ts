import {
  describeRemoteStatus,
  fetchRemote,
  readJsonResponse,
  RemoteUploadError,
} from "@/lib/upload/remote/http";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";

const PIC_SL_ORIGIN = "https://pic.sl.al";
const PIC_SL_TOKEN_URL = `${PIC_SL_ORIGIN}/api/upload-token`;
const PIC_SL_UPLOAD_URL = `${PIC_SL_ORIGIN}/api/upload`;
const PIC_SL_REFERER = `${PIC_SL_ORIGIN}/`;
const PIC_SL_USER_AGENT =
  "Mozilla/5.0 (compatible; BendyShadowsend/1.0; +https://bendy-shadowsend.vercel.app)";
const TOKEN_REFRESH_MARGIN_MS = 30_000;

export type PicSlUploadInput = {
  fileName: string;
  mimeType: string;
  body: Uint8Array<ArrayBuffer>;
};

type PicSlToken = {
  token: string;
  cookie: string | null;
  expiresAt: number;
};

let cachedToken: PicSlToken | null = null;
let pendingToken: Promise<PicSlToken> | null = null;

function readSetCookie(headers: Headers): string | null {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies =
    typeof withGetSetCookie.getSetCookie === "function"
      ? withGetSetCookie.getSetCookie()
      : (headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/);

  for (const cookie of cookies) {
    const pair = cookie.split(";")[0]?.trim();
    if (pair?.startsWith("__Host-imgsess=")) {
      return pair;
    }
  }

  return null;
}

async function requestToken(): Promise<PicSlToken> {
  const response = await fetchRemote(PIC_SL_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Referer: PIC_SL_REFERER,
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": PIC_SL_USER_AGENT,
    },
  });

  const payload = await readJsonResponse(response);
  const token = typeof payload?.token === "string" ? payload.token : null;

  if (!response.ok || payload?.ok !== true || !token) {
    throw new RemoteUploadError(
      `文件上传失败：${describeRemoteStatus(response.status)}`,
      "UPLOAD_PIC_SL_TOKEN_FAILED",
      502,
    );
  }

  const expiresIn =
    typeof payload?.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : 600;

  return {
    token,
    cookie: readSetCookie(response.headers),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

async function getToken(): Promise<PicSlToken> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) {
    return cachedToken;
  }

  if (!pendingToken) {
    pendingToken = requestToken()
      .then((token) => {
        cachedToken = token;
        return token;
      })
      .finally(() => {
        pendingToken = null;
      });
  }

  return pendingToken;
}

export function resetPicSlTokenCache(): void {
  cachedToken = null;
  pendingToken = null;
}

export async function uploadToPicSl(
  input: PicSlUploadInput,
): Promise<{ url: string }> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": input.mimeType || "application/octet-stream",
    "X-Filename": encodeURIComponent(input.fileName),
    "X-Upload-Token": token.token,
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": PIC_SL_USER_AGENT,
    Referer: PIC_SL_REFERER,
  };

  if (token.cookie) {
    headers.Cookie = token.cookie;
  }

  const response = await fetchRemote(PIC_SL_UPLOAD_URL, {
    method: "POST",
    headers,
    body: input.body,
  });

  const payload = await readJsonResponse(response);
  const data =
    payload?.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : null;
  const url = typeof data?.url === "string" ? data.url : null;

  if (!response.ok || payload?.success !== true || !url) {
    const message =
      typeof payload?.message === "string" && payload.message
        ? payload.message
        : describeRemoteStatus(response.status);
    throw new RemoteUploadError(
      `文件上传失败：${message}`,
      "UPLOAD_PIC_SL_REJECTED",
      response.status === 413 ? 413 : 502,
    );
  }

  if (!isAllowedRemoteUrl("pic-sl", url)) {
    throw new RemoteUploadError(
      "文件上传服务返回了不受信任的地址",
      "UPLOAD_REMOTE_URL_INVALID",
      502,
    );
  }

  return { url };
}
