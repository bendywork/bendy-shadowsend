import type { AttachmentItem, MessageItem, RoomTreeItem } from "@/types/chat";

export type ProxyUploadResult = {
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentItem["storage"];
  previewUrl?: string | null;
};

export type DownloadPayload = { url: string };
export type MessageListPayload = { messages: MessageItem[] };
export type ImageViewerState = { url: string; fileName: string };
export type JoinResult = {
  joined: boolean;
  waitingApproval?: boolean;
  roomCode?: string;
};
export type CreateResult = { room: { roomCode: string } };

export type RoomMenuState = {
  room: RoomTreeItem;
  top: number;
  left: number;
};

export type PendingAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
};

export type PendingMessage = {
  localId: string;
  createdAt: string;
  content: string;
  attachments: PendingAttachment[];
  progress: number;
  status: "sending" | "failed";
  error?: string;
};

export type NoticePreviewState = {
  text: string | null;
  images: Array<{
    imageUrl: string;
    imageName: string | null;
  }>;
};

export type NoticeEditorImage = {
  id: string;
  kind: "existing" | "new";
  imageUrl: string;
  imageName: string;
  existingIndex?: number;
  file?: File;
};

export type RoomEntryMode = "create" | "join" | null;
export type MemberPanelTab = "members" | "approvals";

export type RoomEntryErrors = {
  name?: string;
  gateCode?: string;
  roomCode?: string;
};

export type SettingsErrors = {
  roomName?: string;
  gateCode?: string;
};
