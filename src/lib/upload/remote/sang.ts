import {
  describeRemoteStatus,
  fetchRemote,
  readJsonResponse,
  RemoteUploadError,
} from "@/lib/upload/remote/http";
import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import type { SangChannel } from "@/lib/upload/types";

const SANG_UPLOAD_URL = "https://file.sang.pub/api/upload";

export type SangUploadInput = {
  fileName: string;
  mimeType: string;
  body: Uint8Array<ArrayBuffer>;
  sizeBytes: number;
  channel: SangChannel;
};

export async function uploadToSang(
  input: SangUploadInput,
): Promise<{ url: string }> {
  const response = await fetchRemote(SANG_UPLOAD_URL, {
    method: "POST",
    headers: {
      "Content-Type": input.mimeType || "application/octet-stream",
      "X-Upload-Type": input.channel,
      "X-File-Name": encodeURIComponent(input.fileName),
      "X-File-Size": String(input.sizeBytes),
    },
    body: input.body,
  });

  const payload = await readJsonResponse(response);
  const remoteMessage =
    typeof payload?.msg === "string" && payload.msg
      ? payload.msg
      : describeRemoteStatus(response.status);

  if (
    !response.ok ||
    Number(payload?.code) !== 200 ||
    typeof payload?.data !== "string"
  ) {
    throw new RemoteUploadError(
      `图片上传失败：${remoteMessage}`,
      "UPLOAD_SANG_REJECTED",
      response.status === 413 ? 413 : 502,
    );
  }

  if (!isAllowedRemoteUrl("sang", payload.data)) {
    throw new RemoteUploadError(
      "图片上传服务返回了不受信任的地址",
      "UPLOAD_REMOTE_URL_INVALID",
      502,
    );
  }

  return { url: payload.data };
}
