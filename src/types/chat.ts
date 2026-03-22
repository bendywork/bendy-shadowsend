import type {
  AttachmentStorage,
  MemberStatus,
  PreviewType,
  RequestStatus,
  RoomRole,
} from "@prisma/client";

export type ClientUser = {
  id: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
};

export type RoomTreeItem = {
  id: string;
  roomCode: string;
  name: string;
  ownerId: string;
  hasGateCode: boolean;
  gateCodeExpiresAt: string | null;
  createdAt: string;
  role: RoomRole;
};

export type BootstrapPayload = {
  app: {
    name: string;
    version: string;
    openSource: string;
  };
  me: ClientUser;
  tree: {
    createdRooms: RoomTreeItem[];
    joinedRooms: RoomTreeItem[];
  };
  stats: {
    totalOnline: number;
  };
};

export type RoomMemberItem = {
  id: string;
  userId: string;
  role: RoomRole;
  status: MemberStatus;
  joinedAt: string | null;
  lastSeenAt: string | null;
  requiresApproval?: boolean;
  user: ClientUser;
};

export type PendingRequestItem = {
  id: string;
  userId?: string;
  status?: RequestStatus;
  reason: string | null;
  createdAt: string;
  user: ClientUser;
};

export type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentStorage;
  previewType: PreviewType;
  previewUrl?: string | null;
  createdAt: string;
};

export type MessageItem = {
  id: string;
  roomId: string;
  type: "TEXT" | "FILE" | "MIXED";
  content: string;
  createdAt: string;
  sender: ClientUser;
  attachments: AttachmentItem[];
};

export type RoomSnapshot = {
  app: {
    name: string;
    version: string;
    openSource: string;
  };
  room: {
    id: string;
    roomCode: string;
    name: string;
    ownerId: string;
    owner: ClientUser;
    hasGateCode: boolean;
    gateCodeExpiresAt: string | null;
    gateCode: string | null;
  };
  announcement: {
    text: string | null;
    imageUrl: string | null;
    imageName: string | null;
    updatedAt: string | null;
    showToMe: boolean;
  };
  me: ClientUser & {
    role: RoomRole;
  };
  members: RoomMemberItem[];
  pendingRequests: PendingRequestItem[];
  messages: MessageItem[];
  stats: {
    roomOnline: number;
    totalOnline: number;
  };
  waitingApproval?: boolean;
};
