import { PreviewType } from "@prisma/client";
import { resolveStoredRemoteAttachment } from "@/lib/upload/stored-manifest";

type PreviewAttachment = {
  id: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | bigint;
  storage: string;
  previewType: PreviewType;
  chunkManifest?: unknown;
};

type PreviewMessage<TAttachment extends PreviewAttachment = PreviewAttachment> = {
  attachments: TAttachment[];
};

function toPreviewSizeBytes(sizeBytes: number | bigint) {
  return typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;
}

export async function enrichMessagesWithAttachmentPreviewUrls<
  TMessage extends PreviewMessage<TAttachment>,
  TAttachment extends PreviewAttachment,
>(
  messages: TMessage[],
  options?: {
    roomCode?: string;
    logLabel?: string;
  },
): Promise<Array<TMessage & { attachments: Array<TAttachment & { previewUrl: string | null }> }>> {
  return Promise.all(
    messages.map(async (message) => {
      const attachments = await Promise.all(
        message.attachments.map(async (attachment) => {
          const shouldPreview =
            attachment.previewType === PreviewType.IMAGE ||
            attachment.previewType === PreviewType.VIDEO;

          if (!shouldPreview) {
            return {
              ...attachment,
              previewUrl: null,
            };
          }

          try {
            const remote = resolveStoredRemoteAttachment({
              storage: attachment.storage,
              s3Key: attachment.s3Key,
              chunkManifest: attachment.chunkManifest,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: toPreviewSizeBytes(attachment.sizeBytes),
            });

            if (!remote) {
              return { ...attachment, previewUrl: null };
            }

            if (remote.kind === "url") {
              return { ...attachment, previewUrl: remote.url };
            }

            if (!options?.roomCode) {
              return { ...attachment, previewUrl: null };
            }

            return {
              ...attachment,
              previewUrl: `/api/rooms/${encodeURIComponent(options.roomCode)}/attachments/${encodeURIComponent(attachment.id)}/preview`,
            };
          } catch (error) {
            console.error("[preview] enrich failed", {
              label: options?.logLabel ?? "unknown",
              attachmentId: attachment.id,
              s3Key: attachment.s3Key,
              mimeType: attachment.mimeType,
              error,
            });

            return {
              ...attachment,
              previewUrl: null,
            };
          }
        }),
      );

      return {
        ...message,
        attachments,
      };
    }),
  );
}
