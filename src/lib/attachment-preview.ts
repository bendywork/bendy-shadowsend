import { AttachmentStorage, PreviewType } from "@prisma/client";
import { createDufsPublicUrl } from "@/lib/dufs";
import { createAttachmentPreviewUrl } from "@/lib/s3";

type PreviewAttachment = {
  id: string;
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentStorage;
  previewType: PreviewType;
};

type PreviewMessage<TAttachment extends PreviewAttachment = PreviewAttachment> = {
  attachments: TAttachment[];
};

export async function enrichMessagesWithAttachmentPreviewUrls<
  TMessage extends PreviewMessage<TAttachment>,
  TAttachment extends PreviewAttachment,
>(
  messages: TMessage[],
  options?: {
    cookieHeader?: string;
    expiresInSeconds?: number;
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
            if (attachment.storage === AttachmentStorage.DUFS) {
              return {
                ...attachment,
                previewUrl: createDufsPublicUrl(attachment.s3Key),
              };
            }

            const previewUrl = await createAttachmentPreviewUrl({
              key: attachment.s3Key,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              cookieHeader: options?.cookieHeader,
              expiresInSeconds: options?.expiresInSeconds ?? 3600,
            });

            return {
              ...attachment,
              previewUrl,
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
