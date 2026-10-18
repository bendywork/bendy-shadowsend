import { NextResponse } from "next/server";

import { createMergedRemoteStream } from "@/lib/upload/remote-stream";
import type { RemoteAttachment } from "@/lib/upload/stored-manifest";

export function createRemoteAttachmentResponse(params: {
  remote: RemoteAttachment;
  fileName: string;
  mimeType: string;
  disposition: "attachment" | "inline";
}): NextResponse {
  const { remote, fileName, mimeType, disposition } = params;

  if (remote.kind === "url") {
    return NextResponse.redirect(remote.url, 307);
  }

  const encodedName = encodeURIComponent(fileName);
  return new NextResponse(createMergedRemoteStream(remote.manifest), {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(remote.manifest.sizeBytes),
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
