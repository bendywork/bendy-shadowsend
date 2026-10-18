import { isAllowedRemoteUrl } from "@/lib/upload/remote/urls";
import type { UploadManifest } from "@/lib/upload/types";

async function enqueueChunk(
  controller: ReadableStreamDefaultController<Uint8Array>,
  manifest: UploadManifest,
  index: number,
): Promise<void> {
  const chunk = manifest.chunks[index];
  if (!chunk) {
    controller.close();
    return;
  }

  if (!isAllowedRemoteUrl(manifest.service, chunk.url)) {
    controller.error(new Error("远端分片地址无效"));
    return;
  }

  let response: Response;
  try {
    response = await fetch(chunk.url, { cache: "no-store" });
  } catch {
    controller.error(new Error("远端分片下载失败"));
    return;
  }

  if (!response.ok || !response.body) {
    controller.error(new Error("远端分片下载失败"));
    return;
  }

  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.byteLength > 0) controller.enqueue(value);
    }
  } catch {
    controller.error(new Error("远端分片下载失败"));
  }
}

export function createMergedRemoteStream(
  manifest: UploadManifest,
): ReadableStream<Uint8Array> {
  let index = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await enqueueChunk(controller, manifest, index);
      index += 1;
    },
  });
}
