import {
  AttachmentStorage,
  MessageType,
  PreviewType,
  RoomRole,
} from "@prisma/client";
import { decryptText } from "@/lib/encryption";
import {
  parseAttachmentChunkManifest,
  type RemoteAttachmentStorage,
} from "@/lib/attachment-storage";
import type { MessageWithRelations } from "@/lib/room-service";

export type ClientUser = {
  id: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
};

export type ClientAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentStorage;
  previewType: PreviewType;
  previewUrl?: string | null;
  createdAt: string;
  chunked: boolean;
  totalChunks?: number;
  chunkSize?: number;
  integrity: "sha256" | "none";
  canRepair: boolean;
};

export type ClientMessage = {
  id: string;
  roomId: string;
  type: MessageType;
  content: string;
  createdAt: string;
  sender: ClientUser;
  attachments: ClientAttachment[];
};

export type ClientRoomSummary = {
  id: string;
  roomCode: string;
  name: string;
  ownerId: string;
  hasGateCode: boolean;
  gateCodeExpiresAt: string | null;
  createdAt: string;
  role: RoomRole;
};

function toClientSizeBytes(sizeBytes: number | bigint) {
  return typeof sizeBytes === "bigint" ? Number(sizeBytes) : sizeBytes;
}

type AttachmentWithRelations = MessageWithRelations["attachments"][number];

function mapClientAttachment(
  attachment: AttachmentWithRelations,
  viewerId?: string,
): ClientAttachment {
  const storage = attachment.storage;
  const manifest =
    storage === "SANG" || storage === "PIC_SL"
      ? parseAttachmentChunkManifest(
          attachment.chunkManifest,
          storage as RemoteAttachmentStorage,
        )
      : null;
  const hashes = manifest?.chunks.filter((chunk) => chunk.sha256) ?? [];
  const integrity =
    manifest && hashes.length === manifest.chunks.length ? "sha256" : "none";

  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: toClientSizeBytes(attachment.sizeBytes),
    storage,
    previewType: attachment.previewType,
    previewUrl:
      (
        attachment as typeof attachment & {
          previewUrl?: string | null;
        }
      ).previewUrl ?? null,
    createdAt: attachment.createdAt.toISOString(),
    chunked: manifest !== null,
    totalChunks: manifest?.totalChunks,
    chunkSize: manifest?.chunkSize,
    integrity,
    canRepair: Boolean(
      manifest && viewerId && attachment.uploaderId === viewerId,
    ),
  };
}

export function mapClientMessage(
  message: MessageWithRelations,
  viewerId?: string,
): ClientMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    type: message.type,
    content: decryptText(message.encryptedContent),
    createdAt: message.createdAt.toISOString(),
    sender: {
      id: message.sender.id,
      nickname: message.sender.nickname,
      avatarInitial: message.sender.avatarInitial,
      avatarColor: message.sender.avatarColor,
    },
    attachments: message.attachments.map((attachment) =>
      mapClientAttachment(attachment, viewerId),
    ),
  };
}
