import { PreviewType } from "@prisma/client";
import { resolveRemoteAttachment } from "@/lib/attachment-response";

type PreviewAttachment = {
  id: string; s3Key: string; fileName: string; mimeType: string;
  sizeBytes: number | bigint; storage: string; previewType: PreviewType;
  chunkManifest?: unknown;
};

export async function enrichMessagesWithAttachmentPreviewUrls<
  TAttachment extends PreviewAttachment, TMessage extends { attachments: TAttachment[] },
>(messages: TMessage[], options?: { roomCode?: string }) {
  return messages.map((message) => ({
    ...message,
    attachments: message.attachments.map((attachment) => {
      let previewUrl: string | null = null;
      if (attachment.previewType === PreviewType.IMAGE || attachment.previewType === PreviewType.VIDEO) {
        try {
          const remote = resolveRemoteAttachment(attachment);
          previewUrl = remote.chunkManifest
            ? options?.roomCode
              ? `/api/rooms/${encodeURIComponent(options.roomCode)}/attachments/${encodeURIComponent(attachment.id)}/preview`
              : null
            : remote.s3Key;
        } catch { /* Retired or malformed metadata must not break the message list. */ }
      }
      return { ...attachment, previewUrl };
    }),
  }));
}
