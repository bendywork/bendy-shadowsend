import {
  AttachmentStorage,
  MessageType,
  PreviewType,
  RoomRole,
} from "@prisma/client";
import { decryptText } from "@/lib/encryption";
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

export function mapClientMessage(message: MessageWithRelations): ClientMessage {
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
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      storage: attachment.storage,
      previewType: attachment.previewType,
      previewUrl:
        (
          attachment as typeof attachment & {
            previewUrl?: string | null;
          }
        ).previewUrl ?? null,
      createdAt: attachment.createdAt.toISOString(),
    })),
  };
}
