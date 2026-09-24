"use client";

/* eslint-disable @next/next/no-img-element */
import { type ClipboardEvent, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { Check, CheckCheck, ChevronRight, Clock3, Copy, Crown, Download, FileText, LoaderCircle, Megaphone, MoreHorizontal, PanelLeft, PanelLeftClose, PanelRightClose, Plus, QrCode, SendHorizonal, Settings2, Shield, Trash2, UserMinus, Users, X } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY, MAX_ANNOUNCEMENT_IMAGES, MAX_MESSAGE_TEXT_CHARS, MAX_PROXY_UPLOAD_BYTES, MAX_USER_ROOMS, CHUNKED_UPLOAD_THRESHOLD_BYTES, DUFS_CHUNK_SIZE_BYTES } from "@/lib/constants";
import { apiFetch, formatBytes } from "@/lib/client";
import { Avatar } from "@/components/chat/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { IconButton } from "@/components/ui/icon-button";
import { Tooltip } from "@/components/ui/tooltip";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useT } from "@/lib/i18n/context";
import { Popover } from "@/components/ui/popover";
import { usePersistentBoolean } from "@/lib/use-persistent-boolean";
import type { AdBoardItem, AttachmentItem, BootstrapPayload, MessageItem, PendingRequestItem, RoomMemberItem, RoomSnapshot, RoomTreeItem } from "@/types/chat";

type ProxyUploadResult = { s3Key: string; fileName: string; mimeType: string; sizeBytes: number; storage: AttachmentItem["storage"]; previewUrl?: string | null };
type DirectUploadPreparePayload = {
  uploadUrl: string;
  previewUrl?: string | null;
  s3Key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage: AttachmentItem["storage"];
  method: "PUT";
  headers?: Record<string, string>;
};
type DownloadPayload = { url: string };
type MessageListPayload = { messages: MessageItem[] };
type ImageViewerState = { url: string; fileName: string };
type JoinResult = { joined: boolean; waitingApproval?: boolean; roomCode?: string };
type CreateResult = { room: { roomCode: string } };
type RoomMenuState = {
  room: RoomTreeItem;
  top: number;
  left: number;
};
type PendingAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
};
type PendingMessage = {
  localId: string;
  createdAt: string;
  content: string;
  attachments: PendingAttachment[];
  progress: number;
  status: "sending" | "failed";
  error?: string;
};
type NoticePreviewState = {
  text: string | null;
  images: Array<{
    imageUrl: string;
    imageName: string | null;
  }>;
};
type NoticeEditorImage = {
  id: string;
  kind: "existing" | "new";
  imageUrl: string;
  imageName: string;
  existingIndex?: number;
  file?: File;
};

const isPreviewable = (a: { previewType: AttachmentItem["previewType"] }) =>
  a.previewType === "IMAGE" || a.previewType === "VIDEO";
const fmt = (v: string) => new Date(v).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const hasInlinePreview = (a: {
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
}) => isPreviewable(a) && Boolean(a.previewUrl);
const guessPreviewType = (mimeType: string): AttachmentItem["previewType"] => {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("video/")) return "VIDEO";
  return "NONE";
};
const FAST_POLL_INTERVAL_MS = 1200;
const SNAPSHOT_SYNC_INTERVAL_MS = 15_000;
const MAX_MESSAGES_IN_MEMORY = 220;
const MESSAGE_COLLAPSE_CHAR_THRESHOLD = 1200;
const MESSAGE_COLLAPSE_PREVIEW_MAX = 1600;
const MESSAGE_COLLAPSE_PREVIEW_MIN = 360;
const AD_CAROUSEL_INTERVAL_MS = 4200;
const AD_CAROUSEL_SLIDE_MS = 320;
const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function withStableAttachmentPreviewUrls(
  prev: RoomSnapshot | null,
  next: RoomSnapshot,
) {
  if (!prev) return next;

  const existing = new Map<string, string>();
  prev.messages.forEach((message) => {
    message.attachments.forEach((attachment) => {
      if (attachment.previewUrl) {
        existing.set(attachment.id, attachment.previewUrl);
      }
    });
  });

  return {
    ...next,
    messages: next.messages.map((message) => ({
      ...message,
      attachments: message.attachments.map((attachment) => {
        const stablePreviewUrl =
          attachment.previewUrl ?? existing.get(attachment.id) ?? null;
        return {
          ...attachment,
          previewUrl: stablePreviewUrl,
        };
      }),
    })),
  };
}

function mergeIncomingMessages(
  prev: RoomSnapshot,
  incoming: MessageItem[],
) {
  if (incoming.length === 0) return prev;

  const existingIds = new Set(prev.messages.map((message) => message.id));
  const uniqueIncoming = incoming.filter((message) => !existingIds.has(message.id));

  if (uniqueIncoming.length === 0) {
    return prev;
  }

  const merged = [...prev.messages, ...uniqueIncoming];
  const trimmed =
    merged.length > MAX_MESSAGES_IN_MEMORY
      ? merged.slice(-MAX_MESSAGES_IN_MEMORY)
      : merged;

  return withStableAttachmentPreviewUrls(prev, {
    ...prev,
    messages: trimmed,
  });
}

function RoomLinks({
  rooms,
  activeCode,
  onToggleMenu,
  emptyLabel = "暂无",
}: {
  rooms: RoomTreeItem[];
  activeCode: string;
  onToggleMenu: (room: RoomTreeItem, triggerButton: HTMLButtonElement) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      {rooms.length === 0 ? <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">{emptyLabel}</p> : rooms.map((r) => (
        <div
          key={r.id}
          className={clsx(
            "rounded-lg border px-3 py-2 text-sm",
            activeCode === r.roomCode
              ? "border-zinc-500/60 bg-zinc-500/10 text-zinc-100"
              : "border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700",
          )}
        >
          <div className="flex items-start gap-2">
            <Link href={`/room/${r.roomCode}`} className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate">{r.name}</span>
                {activeCode === r.roomCode ? (
                  <span
                    title="当前房间"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  />
                ) : null}
                {r.hasGateCode ? <Shield className="h-3.5 w-3.5 shrink-0 text-zinc-300" /> : null}
              </div>
              <p className="mt-1 truncate font-mono text-[11px] text-zinc-500">{r.roomCode}</p>
            </Link>
            {r.role === "MEMBER" ? (
              <button
                type="button"
                aria-label="房间操作"
                aria-haspopup="menu"
                data-room-menu-trigger={r.id}
                onClick={(event) => onToggleMenu(r, event.currentTarget)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function FileAction({ roomCode, attachment }: { roomCode: string; attachment: AttachmentItem }) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const p = await apiFetch<DownloadPayload>(`/api/rooms/${roomCode}/attachments/${attachment.id}/download`);
      window.open(p.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(e instanceof Error ? e.message : "打开失败");
    } finally { setLoading(false); }
  }
  return <button type="button" onClick={open} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">{loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}下载</button>;
}

type BubbleAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  previewType: AttachmentItem["previewType"];
  previewUrl?: string | null;
};

function MessageAttachmentCard({
  attachment,
  onOpenImage,
  action,
}: {
  attachment: BubbleAttachment;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/80 p-2.5">
      {hasInlinePreview(attachment) ? (
        <div className="mb-2 overflow-hidden rounded-lg border border-zinc-700/80 bg-black">
          {attachment.previewType === "IMAGE" ? (
            <img
              src={attachment.previewUrl ?? ""}
              alt={attachment.fileName}
              className="max-h-[360px] w-full cursor-zoom-in object-contain"
              loading="lazy"
              onDoubleClick={() => onOpenImage(attachment.previewUrl, attachment.fileName)}
            />
          ) : attachment.previewType === "VIDEO" ? (
            <video
              src={attachment.previewUrl ?? ""}
              controls
              preload="metadata"
              className="max-h-[360px] w-full"
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-200">{attachment.fileName}</p>
          <p className="text-xs text-zinc-500">{attachment.mimeType} · {formatBytes(attachment.sizeBytes)}</p>
        </div>
        {action ?? null}
      </div>
    </div>
  );
}

function MessageBubble({
  own,
  avatarInitial,
  avatarColor,
  nickname,
  createdAt,
  metaSlot,
  content,
  collapsed,
  visibleContent,
  onToggleExpand,
  onCopy,
  copied,
  labels,
  attachments,
  renderAttachmentAction,
  onOpenImage,
  footerSlot,
}: {
  own: boolean;
  avatarInitial: string;
  avatarColor: string;
  nickname: string;
  createdAt: string;
  metaSlot?: ReactNode;
  content: string;
  collapsed: boolean;
  visibleContent: string;
  onToggleExpand: () => void;
  onCopy: () => void;
  copied: boolean;
  labels: { copy: string; copied: string; expand: string; collapse: string };
  attachments: BubbleAttachment[];
  renderAttachmentAction?: (attachment: BubbleAttachment) => ReactNode;
  onOpenImage: (url: string | null | undefined, fileName: string) => void;
  footerSlot?: ReactNode;
}) {
  return (
    <article className={clsx("flex", own ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "w-full max-w-[92%] rounded-2xl border p-3 shadow-sm sm:max-w-[85%]",
          own ? "border-zinc-500/40 bg-zinc-500/10" : "border-zinc-800 bg-zinc-900/60",
        )}
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar initial={avatarInitial} color={avatarColor} className="h-7 w-7" />
            <span className="text-sm font-medium text-zinc-200">{nickname}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <time className="tabular-nums">{fmt(createdAt)}</time>
            {metaSlot}
          </div>
        </div>

        {content ? (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{visibleContent}</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onCopy}
                className={clsx(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition",
                  copied
                    ? "border-zinc-500/50 bg-zinc-500/15 text-zinc-100"
                    : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                )}
              >
                <Copy className="h-3 w-3" />
                {copied ? labels.copied : labels.copy}
              </button>
              {content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD ? (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800"
                >
                  {collapsed ? labels.expand : labels.collapse}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {attachments.length ? (
          <div className="mt-3 space-y-2">
            {attachments.map((attachment) => (
              <MessageAttachmentCard
                key={attachment.id}
                attachment={attachment}
                onOpenImage={onOpenImage}
                action={renderAttachmentAction?.(attachment)}
              />
            ))}
          </div>
        ) : null}

        {footerSlot}
      </div>
    </article>
  );
}

function SwitchBtn({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200",
        checked
          ? "border-zinc-500 bg-zinc-500/50"
          : "border-zinc-600 bg-zinc-700",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60",
      )}
    >
      <span
        className={clsx(
          "inline-block h-5 w-5 rounded-full shadow-[0_1px_6px_rgba(0,0,0,0.4)] transition-transform duration-200",
          checked ? "translate-x-5 bg-zinc-100" : "translate-x-0.5 bg-zinc-200",
        )}
      />
    </button>
  );
}

function AdCarouselItem({
  item,
  className,
}: {
  item: AdBoardItem;
  className: string;
}) {
  const textColor = HEX_COLOR_RE.test(item.color) ? item.color : "#d4d4d8";

  if (item.url) {
    return (
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(
          "absolute inset-0 flex items-center px-3 text-sm transition-transform duration-300 ease-out",
          className,
        )}
        style={{ color: textColor }}
        title={item.content}
      >
        <span className="truncate">{item.content}</span>
      </a>
    );
  }

  return (
    <div
      className={clsx(
        "absolute inset-0 flex items-center px-3 text-sm transition-transform duration-300 ease-out",
        className,
      )}
      style={{ color: textColor }}
      title={item.content}
    >
      <span className="truncate">{item.content}</span>
    </div>
  );
}

function AdCarousel({ items }: { items: AdBoardItem[] }) {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setAnimating(true);
    }, AD_CAROUSEL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (!animating || items.length <= 1) return;
    const timer = window.setTimeout(() => {
      setIndex((prev) => (prev + 1) % items.length);
      setAnimating(false);
    }, AD_CAROUSEL_SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [animating, items.length]);

  if (items.length === 0) {
    return null;
  }

  const safeIndex = index % items.length;
  const current = items[safeIndex];
  const next = items[(safeIndex + 1) % items.length];

  return (
    <div className="relative h-9 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/70">
      <AdCarouselItem
        item={current}
        className={animating ? "-translate-y-full" : "translate-y-0"}
      />
      {items.length > 1 ? (
        <AdCarouselItem
          item={next}
          className={animating ? "translate-y-0" : "translate-y-full"}
        />
      ) : null}
    </div>
  );
}

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();

  const [boot, setBoot] = useState<BootstrapPayload | null>(null);
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [enterToSend, setEnterToSend] = useState(true);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});
  const [expandedPendingMessageIds, setExpandedPendingMessageIds] = useState<Record<string, boolean>>({});
  const [copiedTextKeys, setCopiedTextKeys] = useState<Record<string, boolean>>({});

  const [membersCollapsed, , toggleMembersCollapsed] = usePersistentBoolean("tb:members-collapsed", false);
  const [navCollapsed, , toggleNavCollapsed] = usePersistentBoolean("tb:nav-collapsed", false);
  const [createdCollapsed, , toggleCreatedCollapsed] = usePersistentBoolean("tb:nav-group-created", false);
  const [joinedCollapsed, , toggleJoinedCollapsed] = usePersistentBoolean("tb:nav-group-joined", false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [noticeImages, setNoticeImages] = useState<NoticeEditorImage[]>([]);

  const [showNoticePopup, setShowNoticePopup] = useState(false);
  const [noticePreview, setNoticePreview] = useState<NoticePreviewState | null>(null);
  const [gateCodeInput, setGateCodeInput] = useState("");
  const [roomNameInput, setRoomNameInput] = useState("");
  const [openRoomMenu, setOpenRoomMenu] = useState<RoomMenuState | null>(null);
  const [openMemberMenuId, setOpenMemberMenuId] = useState<string | null>(null);
  const [memberPanelTab, setMemberPanelTab] = useState<"members" | "approvals">("members");
  const [roomEntryMode, setRoomEntryMode] = useState<"create" | "join" | null>(null);
  const [roomEntrySubmitting, setRoomEntrySubmitting] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");
  const composerFormRef = useRef<HTMLFormElement | null>(null);
  const copyTextTimerRef = useRef<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement | null>(null);
  const noticeImagesRef = useRef<NoticeEditorImage[]>([]);
  const noticeImageInputRef = useRef<HTMLInputElement | null>(null);
  const floatingRoomMenuRef = useRef<HTMLDivElement | null>(null);
  const memberMenuRef = useRef<HTMLDivElement | null>(null);
  const roomsPanelRef = useRef<HTMLElement | null>(null);
  const membersPanelRef = useRef<HTMLElement | null>(null);
  const latestMessageAtRef = useRef<string | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  const t = useT();
  const isOwner = snap?.me.role === "OWNER";
  const membersVisible = !membersCollapsed;
  const navVisible = !navCollapsed;
  const joinLink = useMemo(() => typeof window === "undefined" ? "" : `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`, [roomCode]);
  const pollingEnabled = Boolean(snap && !snap.waitingApproval);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([apiFetch<BootstrapPayload>("/api/bootstrap"), apiFetch<RoomSnapshot>(`/api/rooms/${roomCode}`)]);
    latestMessageAtRef.current = s.messages.at(-1)?.createdAt ?? null;
    setBoot(b); setSnap((prev) => withStableAttachmentPreviewUrls(prev, s)); setError(null);
    if (s.announcement.showToMe) setShowNoticePopup(true);
  }, [roomCode]);

  const pollLatestMessages = useCallback(async () => {
    const after = latestMessageAtRef.current;
    const search = after ? `?after=${encodeURIComponent(after)}` : "";
    const payload = await apiFetch<MessageListPayload>(`/api/rooms/${roomCode}/messages${search}`);

    if (payload.messages.length === 0) {
      return;
    }

    latestMessageAtRef.current = payload.messages.at(-1)?.createdAt ?? after ?? null;
    setSnap((prev) => (prev ? mergeIncomingMessages(prev, payload.messages) : prev));
    setError(null);
  }, [roomCode]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await refresh(); if (alive) localStorage.setItem(LAST_ROOM_STORAGE_KEY, roomCode); }
      catch (e) { if (alive) setError(e instanceof Error ? e.message : "加载失败"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [roomCode, refresh]);

  useEffect(() => {
    if (!pollingEnabled) return;
    const hb = window.setInterval(() => { void apiFetch<{ success: boolean }>("/api/presence", { method: "POST", body: JSON.stringify({ roomCode }) }).catch(() => undefined); }, 25000);
    const messagePoll = window.setInterval(() => { void pollLatestMessages().catch((e) => setError(e instanceof Error ? e.message : "消息刷新失败")); }, FAST_POLL_INTERVAL_MS);
    const snapshotSync = window.setInterval(() => { void refresh().catch((e) => setError(e instanceof Error ? e.message : "房间同步失败")); }, SNAPSHOT_SYNC_INTERVAL_MS);
    return () => { window.clearInterval(hb); window.clearInterval(messagePoll); window.clearInterval(snapshotSync); };
  }, [roomCode, pollingEnabled, pollLatestMessages, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [snap?.messages.length, pendingMessages.length]);

  useEffect(() => {
    if (!showQr || !joinLink) return;
    setQr(null);
    void QRCode.toDataURL(joinLink, { width: 280, margin: 1, color: { dark: "#18181b", light: "#ffffff" } }).then(setQr);
  }, [showQr, joinLink]);

  useEffect(() => {
    if (!imageViewer) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageViewer(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imageViewer]);

  useEffect(() => {
    if (!openRoomMenu) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (floatingRoomMenuRef.current?.contains(target)) return;

      const triggerElement = target instanceof Element
        ? target.closest(`[data-room-menu-trigger="${openRoomMenu.room.id}"]`)
        : null;
      if (triggerElement) return;

      setOpenRoomMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenRoomMenu(null);
      }
    };
    const closeRoomMenu = () => {
      setOpenRoomMenu(null);
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", closeRoomMenu);
    window.addEventListener("scroll", closeRoomMenu, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", closeRoomMenu);
      window.removeEventListener("scroll", closeRoomMenu, true);
    };
  }, [openRoomMenu]);

  useEffect(() => {
    if (!openMemberMenuId) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (memberMenuRef.current?.contains(target)) return;
      setOpenMemberMenuId(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMemberMenuId(null);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openMemberMenuId]);

  useEffect(() => {
    if (isOwner) return;
    setOpenMemberMenuId(null);
  }, [isOwner]);

  useEffect(() => {
    if (!isOwner && memberPanelTab !== "members") {
      setMemberPanelTab("members");
    }
  }, [isOwner, memberPanelTab]);

  useEffect(() => {
    if (!snap || snap.me.role !== "OWNER") return;
    setGateCodeInput(snap.room.gateCode ?? "");
    setRoomNameInput(snap.room.name);
  }, [snap]);

  useEffect(() => {
    noticeImagesRef.current = noticeImages;
  }, [noticeImages]);

  useEffect(() => {
    const copyTimerMapRef = copyTextTimerRef;
    return () => {
      noticeImagesRef.current.forEach((item) => {
        if (item.kind === "new" && item.imageUrl.startsWith("blob:")) {
          URL.revokeObjectURL(item.imageUrl);
        }
      });
      Object.values(copyTimerMapRef.current).forEach((timer) => {
        window.clearTimeout(timer);
      });
    };
  }, []);

  const rooms = useMemo(() => ({ created: boot?.tree.createdRooms ?? [], joined: boot?.tree.joinedRooms ?? [] }), [boot]);
  const roomCount = rooms.created.length + rooms.joined.length;
  const canAddMoreRooms = roomCount < MAX_USER_ROOMS;
  const clampMessageText = useCallback((value: string) => value.slice(0, MAX_MESSAGE_TEXT_CHARS), []);

  function sortRooms(items: RoomTreeItem[]) {
    return [...items].sort((a, b) => {
      const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.roomCode.localeCompare(b.roomCode);
    });
  }

  const appendMessageText = useCallback((incoming: string) => {
    const normalized = incoming.trim();
    if (!normalized) return;
    setText((prev) => clampMessageText(prev ? `${prev}\n${normalized}` : normalized));
  }, [clampMessageText]);

  function getCollapsedPreviewText(content: string) {
    const halfLength = Math.floor(content.length / 2);
    const previewLength = Math.max(
      MESSAGE_COLLAPSE_PREVIEW_MIN,
      Math.min(MESSAGE_COLLAPSE_PREVIEW_MAX, halfLength),
    );
    return content.slice(0, previewLength);
  }

  function isMessageCollapsed(content: string, expanded: boolean) {
    return content.length > MESSAGE_COLLAPSE_CHAR_THRESHOLD && !expanded;
  }

  function addFiles(input: FileList | File[]) {
    const incoming = Array.from(input);
    if (!incoming.length) return;
    setFiles((prev) => [...prev, ...incoming].slice(0, 20));
  }

  async function readClipboard() {
    if (!navigator.clipboard) return;
    try {
      if (navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        const clipboardFiles: File[] = [];
        const textChunks: string[] = [];
        let fileCounter = 0;

        for (const item of items) {
          const fileLikeTypes = item.types.filter((type) => !type.startsWith("text/"));

          if (fileLikeTypes.length > 0) {
            let preferredName: string | null = null;
            if (item.types.includes("text/plain")) {
              try {
                const nameBlob = await item.getType("text/plain");
                const nameText = (await nameBlob.text()).trim();
                if (nameText && !nameText.includes("\n")) {
                  preferredName = nameText.split(/[\\/]/).pop() ?? nameText;
                }
              } catch {
                preferredName = null;
              }
            }

            for (const type of fileLikeTypes) {
              try {
                const blob = await item.getType(type);
                const safeType =
                  blob.type || (type.includes("/") ? type : "application/octet-stream");
                const defaultName = `clipboard-file-${Date.now()}-${fileCounter + 1}`;
                const rawName = preferredName ?? defaultName;
                const safeName = rawName.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
                const ext = safeType.includes("/")
                  ? safeType.split("/")[1]?.split(";")[0] ?? ""
                  : "";
                const finalName =
                  safeName.includes(".") || !ext ? safeName : `${safeName}.${ext}`;

                clipboardFiles.push(new File([blob], finalName, { type: safeType }));
                fileCounter += 1;
              } catch {
                // Ignore unsupported clipboard entry types.
              }
            }

            // If current clipboard item already contains file data, ignore its text payload.
            continue;
          }

          for (const type of item.types) {
            if (!type.startsWith("text/")) continue;
            try {
              const blob = await item.getType(type);
              const text = (await blob.text()).trim();
              if (text) textChunks.push(text);
            } catch {
              // Ignore unavailable text entry types.
            }
          }
        }

        if (clipboardFiles.length > 0) {
          addFiles(clipboardFiles);
          return;
        }

        if (textChunks.length > 0) {
          const mergedText = Array.from(new Set(textChunks)).join("\n");
          if (mergedText.trim()) {
            appendMessageText(mergedText);
          }
        }
      } else {
        const t = await navigator.clipboard.readText();
        appendMessageText(t);
      }
    } catch {}
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const fs: File[] = [];
    for (const it of e.clipboardData.items) if (it.kind === "file") { const f = it.getAsFile(); if (f) fs.push(f); }
    if (fs.length) { addFiles(fs); e.preventDefault(); }
  }

  function onComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!enterToSend) return;
    if (event.key !== "Enter") return;
    if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.nativeEvent.isComposing) return;

    event.preventDefault();
    composerFormRef.current?.requestSubmit();
  }

  async function uploadByProxy(file: File, onProgress?: (percent: number) => void) {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const requestUrl = `/api/rooms/${roomCode}/upload`;
    const payload = await new Promise<ProxyUploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", requestUrl, true);
      xhr.withCredentials = true;

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      };

      xhr.onerror = () => {
        console.error("[upload] xhr network error", {
          requestUrl,
          roomCode,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        reject(new Error(`Upload failed: ${file.name}`));
      };

      xhr.onload = () => {
        if (xhr.status === 413) {
          console.error("[upload] proxy payload too large", {
            requestUrl,
            roomCode,
            status: xhr.status,
            responseText: xhr.responseText,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
          reject(new Error("中转上传被服务平台拒绝（413），请优先使用 S3 直传"));
          return;
        }

        let parsed:
          | {
              ok: boolean;
              data?: ProxyUploadResult;
              error?: { message?: string; code?: string };
            }
          | null = null;

        try {
          parsed = xhr.responseText
            ? (JSON.parse(xhr.responseText) as {
                ok: boolean;
                data?: ProxyUploadResult;
                error?: { message?: string; code?: string };
              })
            : null;
        } catch (parseError) {
          console.error("[upload] xhr parse error", {
            requestUrl,
            roomCode,
            status: xhr.status,
            responseText: xhr.responseText,
            error: parseError,
          });
          reject(new Error(`Upload failed: ${file.name}`));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && parsed?.ok && parsed.data) {
          if (onProgress) onProgress(100);
          resolve(parsed.data);
          return;
        }

        console.error("[upload] xhr response error", {
          requestUrl,
          roomCode,
          status: xhr.status,
          responseText: xhr.responseText,
          payload: parsed,
        });

        reject(new Error(parsed?.error?.message ?? `Upload failed: ${file.name}`));
      };

      xhr.send(formData);
    });

    return payload;
  }

  async function uploadByChunkedProxy(file: File, onProgress?: (percent: number) => void) {
    const totalChunks = Math.ceil(file.size / DUFS_CHUNK_SIZE_BYTES);
    let dufsPath: string | null = null;

    const cleanupDufsFile = async () => {
      if (!dufsPath) return;
      await fetch(`/api/rooms/${roomCode}/upload/chunk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dufsPath }),
      }).catch(() => {});
    };

    for (let i = 0; i < totalChunks; i++) {
      const start = i * DUFS_CHUNK_SIZE_BYTES;
      const end = Math.min(start + DUFS_CHUNK_SIZE_BYTES, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append("file", chunk, file.name);
      formData.append("chunkIndex", String(i));
      formData.append("totalChunks", String(totalChunks));
      formData.append("totalBytes", String(file.size));
      formData.append("fileName", file.name);
      formData.append("mimeType", file.type);
      if (dufsPath) {
        formData.append("dufsPath", dufsPath);
      }

      const requestUrl = `/api/rooms/${roomCode}/upload/chunk`;

      let response: Response;
      try {
        response = await fetch(requestUrl, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
      } catch {
        await cleanupDufsFile();
        throw new Error(`Upload failed: ${file.name}`);
      }

      let parsed: {
        ok: boolean;
        data?: ProxyUploadResult & { dufsPath: string };
        error?: { message?: string };
      } | null = null;

      try {
        parsed = await response.json();
      } catch {
        await cleanupDufsFile();
        throw new Error(`Upload failed: ${file.name}`);
      }

      if (!response.ok || !parsed?.ok || !parsed?.data) {
        await cleanupDufsFile();
        throw new Error(parsed?.error?.message ?? `Upload failed: ${file.name}`);
      }

      if (i === 0) {
        dufsPath = parsed.data.dufsPath;
      }

      if (onProgress) {
        onProgress(Math.min(100, Math.round(((i + 1) / totalChunks) * 100)));
      }

      if (parsed.data.s3Key) {
        return {
          s3Key: parsed.data.s3Key,
          fileName: parsed.data.fileName,
          mimeType: parsed.data.mimeType,
          sizeBytes: parsed.data.sizeBytes,
          storage: parsed.data.storage,
          previewUrl: parsed.data.previewUrl ?? null,
        } satisfies ProxyUploadResult;
      }
    }

    throw new Error(`Upload failed: ${file.name}`);
  }

  async function uploadDirectToS3(file: File, onProgress?: (percent: number) => void) {
    const mimeType = file.type?.trim() || "application/octet-stream";
    const prepare = await apiFetch<DirectUploadPreparePayload>(`/api/rooms/${roomCode}/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    });

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(prepare.method ?? "PUT", prepare.uploadUrl, true);

      Object.entries(prepare.headers ?? {}).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      };

      xhr.onerror = () => {
        console.error("[upload-direct] xhr network error", {
          roomCode,
          uploadUrl: prepare.uploadUrl,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        reject(new Error(`Upload failed: ${file.name}`));
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve();
          return;
        }

        console.error("[upload-direct] xhr response error", {
          roomCode,
          uploadUrl: prepare.uploadUrl,
          status: xhr.status,
          responseText: xhr.responseText,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        });
        reject(new Error(`Upload failed: ${file.name}`));
      };

      xhr.send(file);
    });

    return {
      s3Key: prepare.s3Key,
      fileName: prepare.fileName,
      mimeType: prepare.mimeType,
      sizeBytes: prepare.sizeBytes,
      storage: prepare.storage ?? "S3",
      previewUrl: prepare.previewUrl ?? null,
    } satisfies ProxyUploadResult;
  }

  async function upload(file: File, onProgress?: (percent: number) => void) {
    try {
      return await uploadDirectToS3(file, onProgress);
    } catch (directUploadError) {
      console.error("[upload] direct upload failed, falling back to proxy", {
        roomCode,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        error: directUploadError,
      });

      if (file.size > MAX_PROXY_UPLOAD_BYTES) {
        throw new Error(
          `文件超过 ${Math.floor(MAX_PROXY_UPLOAD_BYTES / 1024 / 1024)}MB 中转上限，请启用 S3 直传或缩小文件后重试`,
        );
      }

      if (file.type.startsWith("image/") && file.size >= CHUNKED_UPLOAD_THRESHOLD_BYTES) {
        return uploadByChunkedProxy(file, onProgress);
      }

      return uploadByProxy(file, onProgress);
    }
  }

  function updatePendingMessage(localId: string, patch: Partial<PendingMessage>) {
    setPendingMessages((prev) =>
      prev.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    );
  }

  function getMessageDeliveryState(message: MessageItem): "sent" | "read" | null {
    if (!snap) return null;
    if (message.sender.id !== snap.me.id) return null;

    const messageTime = new Date(message.createdAt).getTime();
    const readByOthers = snap.members.some(
      (member) =>
        member.userId !== snap.me.id &&
        member.lastSeenAt &&
        new Date(member.lastSeenAt).getTime() >= messageTime,
    );

    return readByOthers ? "read" : "sent";
  }

  function openImageViewer(url: string | null | undefined, fileName: string) {
    if (!url) return;
    setImageViewer({
      url,
      fileName,
    });
  }

  function scrollToPanel(target: "rooms" | "members") {
    const panelRef = target === "rooms" ? roomsPanelRef : membersPanelRef;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runSend(localId: string, content: string, sendingFiles: File[]) {
    try {
      let attachments: ProxyUploadResult[] = [];

      if (sendingFiles.length > 0) {
        const totalBytes = sendingFiles.reduce((sum, file) => sum + file.size, 0);
        const loadedBytesMap = new Map<number, number>();

        attachments = await Promise.all(
          sendingFiles.map((file, index) =>
            upload(file, (percent) => {
              if (totalBytes <= 0) {
                updatePendingMessage(localId, { progress: percent });
                return;
              }

              const loadedBytes = Math.round((file.size * percent) / 100);
              loadedBytesMap.set(index, loadedBytes);
              const loadedTotal = Array.from(loadedBytesMap.values()).reduce(
                (sum, value) => sum + value,
                0,
              );
              const progress = Math.min(99, Math.round((loadedTotal / totalBytes) * 100));
              updatePendingMessage(localId, { progress });
            }),
          ),
        );
      }

      updatePendingMessage(localId, { progress: 99 });

      const result = await apiFetch<{ message: MessageItem }>(
        `/api/rooms/${roomCode}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            content: content || undefined,
            attachments: attachments.map((attachment) => ({
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              s3Key: attachment.s3Key,
              storage: attachment.storage,
            })),
          }),
        },
      );

      setPendingMessages((prev) => prev.filter((item) => item.localId !== localId));
      setSnap((prev) => {
        if (!prev) return prev;
        return mergeIncomingMessages(prev, [result.message]);
      });
      latestMessageAtRef.current = result.message.createdAt;
      setError(null);
      // Extra sync after a previously failed send, to keep UI and server state aligned.
      void pollLatestMessages().catch(() => undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Send failed";
      updatePendingMessage(localId, {
        status: "failed",
        error: message,
      });
      setError(message);
    }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const content = text.trim();
    const sendingFiles = [...files];
    if (!content && sendingFiles.length === 0) return;

    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingAttachments: PendingAttachment[] = sendingFiles.map((file, index) => ({
      id: `${localId}-${index}`,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      previewType: guessPreviewType(file.type || "application/octet-stream"),
      previewUrl:
        (file.type || "").startsWith("image/") || (file.type || "").startsWith("video/")
          ? URL.createObjectURL(file)
          : null,
    }));

    setPendingMessages((prev) => [
      ...prev.filter((item) => item.status === "sending"),
      {
        localId,
        createdAt: new Date().toISOString(),
        content,
        attachments: pendingAttachments,
        progress: 0,
        status: "sending",
      },
    ]);

    setText("");
    setFiles([]);

    void runSend(localId, content, sendingFiles);
  }
  async function kick(m: RoomMemberItem) {
    if (!window.confirm(`确认将 ${m.user.nickname} 移出房间吗？`)) return;
    setAction(`kick-${m.id}`);
    try { await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/members/${m.id}/kick`, { method: "POST", body: JSON.stringify({}) }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "移出失败"); }
    finally { setAction(null); }
  }

  async function transferOwner(m: RoomMemberItem) {
    if (!window.confirm(`确认将房主身份转让给 ${m.user.nickname} 吗？转让后你将变为普通成员。`)) return;
    setAction(`transfer-${m.id}`);
    try {
      await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/members/${m.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
      setHint(`已将房主身份转让给 ${m.user.nickname}`);
      window.setTimeout(() => setHint(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "转让失败");
    } finally {
      setAction(null);
    }
  }

  async function review(r: PendingRequestItem, act: "approve" | "reject") {
    setAction(`${act}-${r.id}`);
    try { await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/join-requests/${r.id}`, { method: "POST", body: JSON.stringify({ action: act }) }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "审批失败"); }
    finally { setAction(null); }
  }

  function openRoomEntry(mode: "create" | "join") {
    if (!canAddMoreRooms) {
      setError(`已达到房间数量上限（${MAX_USER_ROOMS}）`);
      return;
    }
    setError(null);
    setHint(null);
    setRoomEntryMode(mode);
  }

  async function quickCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddMoreRooms) {
      setError(`已达到房间数量上限（${MAX_USER_ROOMS}）`);
      return;
    }
    setRoomEntrySubmitting(true);
    setError(null);
    setHint(null);

    try {
      const payload = await apiFetch<CreateResult>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          gateCode: createGateCode || undefined,
        }),
      });

      setRoomEntryMode(null);
      localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.room.roomCode);
      router.push(`/room/${payload.room.roomCode}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建房间失败");
    } finally {
      setRoomEntrySubmitting(false);
    }
  }

  async function quickJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAddMoreRooms) {
      setError(`已达到房间数量上限（${MAX_USER_ROOMS}）`);
      return;
    }
    setRoomEntrySubmitting(true);
    setError(null);
    setHint(null);

    try {
      const targetRoomCode = joinRoomCode.trim();
      const payload = await apiFetch<JoinResult>(`/api/rooms/${targetRoomCode}/join`, {
        method: "POST",
        body: JSON.stringify({
          gateCode: joinGateCode || undefined,
          inviteToken: joinInviteToken || undefined,
        }),
      });

      if (payload.waitingApproval) {
        setHint("已提交加入申请，等待房主审批。");
        setRoomEntryMode(null);
        window.setTimeout(() => setHint(null), 2200);
        return;
      }

      if (payload.joined && payload.roomCode) {
        setRoomEntryMode(null);
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "加入房间失败");
    } finally {
      setRoomEntrySubmitting(false);
    }
  }

  async function leaveRoom(target: RoomTreeItem) {
    if (target.role !== "MEMBER") return;
    if (!window.confirm(`确认退出房间「${target.name}」吗？`)) return;

    setOpenRoomMenu(null);
    setAction(`leave-${target.roomCode}`);
    setError(null);
    setHint(null);

    try {
      await apiFetch<{ success: boolean }>(`/api/rooms/${target.roomCode}/leave`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const latestBoot = await apiFetch<BootstrapPayload>("/api/bootstrap");
      setBoot(latestBoot);

      if (target.roomCode === roomCode) {
        const nextRoomCode =
          latestBoot.tree.createdRooms[0]?.roomCode ??
          latestBoot.tree.joinedRooms[0]?.roomCode;
        if (nextRoomCode) {
          localStorage.setItem(LAST_ROOM_STORAGE_KEY, nextRoomCode);
          router.push(`/room/${nextRoomCode}`);
        } else {
          localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
          router.push("/");
        }
        return;
      }

      setHint(`已退出房间「${target.name}」`);
      window.setTimeout(() => setHint(null), 2200);
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "退出房间失败");
    } finally {
      setAction(null);
    }
  }

  async function copyLink() {
    if (!joinLink) return;
    try { await navigator.clipboard.writeText(joinLink); setHint("当前房间加入链接已复制"); window.setTimeout(() => setHint(null), 2200); }
    catch { setError("复制失败，请检查浏览器权限"); }
  }

  function markTextCopied(feedbackKey: string) {
    setCopiedTextKeys((prev) => ({
      ...prev,
      [feedbackKey]: true,
    }));

    const existingTimer = copyTextTimerRef.current[feedbackKey];
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    copyTextTimerRef.current[feedbackKey] = window.setTimeout(() => {
      setCopiedTextKeys((prev) => {
        const next = { ...prev };
        delete next[feedbackKey];
        return next;
      });
      delete copyTextTimerRef.current[feedbackKey];
    }, 1400);
  }

  async function copyMessageText(content: string, feedbackKey: string) {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      markTextCopied(feedbackKey);
    } catch {
      setError("复制失败，请检查浏览器权限");
    }
  }
  function releaseNoticeEditorImages(items: NoticeEditorImage[]) {
    items.forEach((item) => {
      if (item.kind === "new" && item.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(item.imageUrl);
      }
    });
  }

  function closeNoticeEditor() {
    setShowNoticeEditor(false);
    setNoticePreview(null);
    setNoticeText("");
    setNoticeImages((prev) => {
      releaseNoticeEditorImages(prev);
      return [];
    });
  }

  function removeNoticeImage(id: string) {
    setNoticeImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.kind === "new" && target.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.imageUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }

  function addNoticeImages(fileList: FileList | null) {
    if (!fileList) return;

    const selected = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (selected.length === 0) return;

    const remaining = MAX_ANNOUNCEMENT_IMAGES - noticeImages.length;
    if (remaining <= 0) {
      setHint(`公告最多上传 ${MAX_ANNOUNCEMENT_IMAGES} 张图片`);
      window.setTimeout(() => setHint(null), 2200);
      return;
    }

    const accepted = selected.slice(0, remaining);
    if (accepted.length < selected.length) {
      setHint(`最多上传 ${MAX_ANNOUNCEMENT_IMAGES} 张，超出部分已忽略`);
      window.setTimeout(() => setHint(null), 2200);
    }

    const addedItems = accepted.map((file, index) => ({
      id: `notice-new-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      kind: "new" as const,
      imageUrl: URL.createObjectURL(file),
      imageName: file.name,
      file,
    }));

    setNoticeImages((prev) => [...prev, ...addedItems]);
  }

  function openNoticeEditor() {
    if (!snap) return;
    setNoticeText(snap.announcement.text ?? "");
    setNoticePreview(null);
    setShowNoticePopup(false);
    setNoticeImages((prev) => {
      releaseNoticeEditorImages(prev);
      return (snap.announcement.images ?? []).map((item, index) => ({
        id: `notice-existing-${index}`,
        kind: "existing",
        imageUrl: item.imageUrl,
        imageName: item.imageName ?? `announcement-${index + 1}`,
        existingIndex: index,
      }));
    });
    setShowNoticeEditor(true);
  }

  function openNoticeViewer() {
    if (!snap) return;
    const hasNoticeContent = Boolean(
      snap.announcement.text || snap.announcement.images.length > 0,
    );
    if (!hasNoticeContent) {
      setHint("当前暂无公告");
      window.setTimeout(() => setHint(null), 2200);
      return;
    }
    setNoticePreview(null);
    setShowNoticePopup(true);
  }

  function previewNoticeDraft() {
    if (!snap) return;
    const draftText = noticeText.trim() || null;
    const draftImages = noticeImages.map((image) => ({
      imageUrl: image.imageUrl,
      imageName: image.imageName,
    }));

    if (!draftText && draftImages.length === 0) {
      setError("公告内容与图片不能同时为空");
      return;
    }

    setNoticePreview({
      text: draftText,
      images: draftImages,
    });
    setShowNoticePopup(true);
  }

  async function saveNotice() {
    setAction("notice");
    try {
      const keepImageIndexes = noticeImages
        .filter((image) => image.kind === "existing")
        .map((image) => image.existingIndex)
        .filter((index): index is number => typeof index === "number");

      const newNoticeFiles = noticeImages
        .filter((image) => image.kind === "new" && image.file)
        .map((image) => image.file as File);

      const uploadedNewImages = await Promise.all(newNoticeFiles.map((file) => upload(file)));

      await apiFetch<{ announcement: unknown }>(`/api/rooms/${roomCode}/announcement`, {
        method: "POST",
        body: JSON.stringify({
          text: noticeText || undefined,
          keepImageIndexes,
          newImages: uploadedNewImages.map((image) => ({
            s3Key: image.s3Key,
            fileName: image.fileName,
            mimeType: image.mimeType,
            sizeBytes: image.sizeBytes,
            storage: image.storage,
          })),
        }),
      });
      closeNoticeEditor();
      await refresh();
      setHint("公告已更新");
      window.setTimeout(() => setHint(null), 2200);
    } catch (err) { setError(err instanceof Error ? err.message : "公告保存失败"); }
    finally { setAction(null); }
  }

  async function closeNoticePopup() {
    if (noticePreview) {
      setNoticePreview(null);
      setShowNoticePopup(false);
      return;
    }

    if (!snap?.announcement.showToMe) {
      setShowNoticePopup(false);
      return;
    }

    try {
      await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/announcement/seen`, { method: "POST", body: JSON.stringify({}) });
      setSnap((prev) => prev ? { ...prev, announcement: { ...prev.announcement, showToMe: false } } : prev);
      setShowNoticePopup(false);
    } catch (err) { setError(err instanceof Error ? err.message : "公告已读失败"); }
  }

  async function dissolve() {
    if (!window.confirm("确认解散当前房间？解散后成员将全部退出。")) return;
    setAction("dissolve");
    try {
      const beforeSortedRooms = sortRooms([...rooms.created, ...rooms.joined]);
      const currentIndex = beforeSortedRooms.findIndex((item) => item.roomCode === roomCode);

      await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/dissolve`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      const latestBoot = await apiFetch<BootstrapPayload>("/api/bootstrap");
      setBoot(latestBoot);

      const remainingRooms = sortRooms([
        ...latestBoot.tree.createdRooms,
        ...latestBoot.tree.joinedRooms,
      ]);

      if (remainingRooms.length === 0) {
        localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
        router.push("/");
        return;
      }

      const nextIndex =
        currentIndex >= 0
          ? Math.min(currentIndex, remainingRooms.length - 1)
          : 0;
      const nextRoomCode = remainingRooms[nextIndex]?.roomCode ?? remainingRooms[0]?.roomCode;

      if (nextRoomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, nextRoomCode);
        router.push(`/room/${nextRoomCode}`);
      } else {
        localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
        router.push("/");
      }
    }
    catch (err) { setError(err instanceof Error ? err.message : "解散失败"); }
    finally { setAction(null); }
  }

  async function updateRoomName() {
    if (!isOwner) return;
    setAction("room-name");
    setError(null);
    try {
      const normalized = roomNameInput.trim();
      if (!normalized) {
        throw new Error("房间名称不能为空");
      }

      const result = await apiFetch<{ name: string }>(
        `/api/rooms/${roomCode}/name`,
        {
          method: "POST",
          body: JSON.stringify({
            name: normalized,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                name: result.name,
              },
            }
          : prev,
      );
      setRoomNameInput(result.name);

      setHint("房间名称已更新");
      window.setTimeout(() => setHint(null), 2200);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "房间名称更新失败");
    } finally {
      setAction(null);
    }
  }

  async function updateGateCode() {
    if (!isOwner) return;
    setAction("gate-code");
    setError(null);
    try {
      const normalized = gateCodeInput.replace(/\D/g, "").slice(0, 6);
      if (normalized.length > 0 && normalized.length !== 6) {
        throw new Error("门禁码必须是 6 位数字，留空则表示不设置门禁码");
      }

      await apiFetch<{ gateCode: string | null; hasGateCode: boolean }>(
        `/api/rooms/${roomCode}/gate-code`,
        {
          method: "POST",
          body: JSON.stringify({
            gateCode: normalized || undefined,
          }),
        },
      );
      await refresh();
      setHint(normalized ? "门禁码已更新" : "已清除门禁码");
      window.setTimeout(() => setHint(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "门禁码更新失败");
    } finally {
      setAction(null);
    }
  }

  async function updateJoinPolicy(nextAllowJoinRequest: boolean) {
    if (!isOwner) return;
    setAction("join-policy");
    setError(null);
    try {
      const result = await apiFetch<{ allowJoinRequest: boolean }>(
        `/api/rooms/${roomCode}/join-policy`,
        {
          method: "POST",
          body: JSON.stringify({
            allowJoinRequest: nextAllowJoinRequest,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                allowJoinRequest: result.allowJoinRequest,
              },
            }
          : prev,
      );

      setHint(result.allowJoinRequest ? "已允许申请加入房间" : "已拒绝申请加入房间");
      window.setTimeout(() => setHint(null), 2200);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新加入策略失败");
    } finally {
      setAction(null);
    }
  }

  async function updateNeverExpire(nextNeverExpire: boolean) {
    if (!isOwner) return;
    setAction("never-expire");
    setError(null);
    try {
      const result = await apiFetch<{ neverExpire: boolean }>(
        `/api/rooms/${roomCode}/never-expire`,
        {
          method: "POST",
          body: JSON.stringify({
            neverExpire: nextNeverExpire,
          }),
        },
      );

      setSnap((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                neverExpire: result.neverExpire,
              },
            }
          : prev,
      );

      setHint(result.neverExpire ? "已开启永不过期" : "已关闭永不过期");
      window.setTimeout(() => setHint(null), 2200);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新永不过期失败");
    } finally {
      setAction(null);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-300">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (error && !snap) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <Link href="/" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200">
          返回首页
        </Link>
      </main>
    );
  }

  if (!snap) return null;

  if (snap.waitingApproval) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900/90 p-8 text-center">
          <Clock3 className="mx-auto h-8 w-8 text-zinc-300" />
          <h1 className="mt-4 text-xl font-semibold text-zinc-100">等待房主审批</h1>
          <p className="mt-2 text-sm text-zinc-400">你曾被移出该房间，再次加入需要房主审批。</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-zinc-700 px-4 py-2 text-sm text-white">
            返回首页
          </Link>
        </section>
      </main>
    );
  }

  const noticePopupContent = noticePreview ?? {
    text: snap.announcement.text,
    images: snap.announcement.images ?? [],
  };
  const isPreviewingNoticeDraft = Boolean(noticePreview);

  function handleToggleRoomMenu(targetRoom: RoomTreeItem, triggerButton: HTMLButtonElement) {
    if (openRoomMenu?.room.id === targetRoom.id) {
      setOpenRoomMenu(null);
      return;
    }
    const rect = triggerButton.getBoundingClientRect();
    const menuWidth = 100;
    const menuHeight = 36;
    const viewportPadding = 8;
    const nextLeft = Math.max(
      viewportPadding,
      Math.min(window.innerWidth - menuWidth - viewportPadding, rect.right - menuWidth),
    );
    const nextTop = rect.bottom + 6 + menuHeight > window.innerHeight
      ? Math.max(viewportPadding, rect.top - menuHeight - 6)
      : rect.bottom + 6;
    setOpenRoomMenu({ room: targetRoom, left: nextLeft, top: nextTop });
  }

  return (
    <>
      <main
        className={clsx(
          "grid min-h-[100dvh] w-full grid-cols-1 gap-0 bg-black xl:h-[100dvh] xl:overflow-hidden",
          navVisible && membersVisible && "xl:grid-cols-[290px_minmax(0,1fr)_290px]",
          navVisible && !membersVisible && "xl:grid-cols-[290px_minmax(0,1fr)]",
          !navVisible && membersVisible && "xl:grid-cols-[minmax(0,1fr)_290px]",
          !navVisible && !membersVisible && "xl:grid-cols-[minmax(0,1fr)]",
        )}
      >
        <aside
          ref={roomsPanelRef}
          className={clsx(
            "order-2 min-h-0 max-h-[52vh] flex-col rounded-none border border-zinc-900 bg-zinc-950 p-4 xl:order-1 xl:max-h-none",
            navVisible ? "flex" : "hidden",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/70 p-1">
                <Image
                  src="/1.png"
                  alt="Temp Bendy"
                  fill
                  sizes="36px"
                  className="theme-dark-only object-contain p-1"
                />
                <Image
                  src="/1-light.png"
                  alt="Temp Bendy（日间）"
                  fill
                  sizes="36px"
                  className="theme-light-only object-contain p-1"
                />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{t("nav.title")}</p>
                <h2 className="truncate text-lg font-semibold text-zinc-100">{t("nav.subtitle")}</h2>
              </div>
            </div>
            <Tooltip label={t("nav.collapse")}>
              <IconButton aria-label={t("nav.collapse")} onClick={toggleNavCollapsed}>
                <PanelLeftClose className="h-4 w-4" />
              </IconButton>
            </Tooltip>
          </div>
          <p className="mb-3 flex flex-wrap items-center gap-x-1.5 text-[11px] text-zinc-500">
            <span>{t("nav.count", { count: roomCount, max: MAX_USER_ROOMS })}</span>
            {!canAddMoreRooms ? <span className="text-zinc-600">· {t("nav.count.full")}</span> : null}
          </p>
          <div className="flex-1 space-y-4 overflow-y-auto pb-3">
            <div>
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleCreatedCollapsed}
                  aria-expanded={!createdCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-xs uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300"
                >
                  <ChevronRight className={clsx("h-3.5 w-3.5 shrink-0 transition-transform", !createdCollapsed && "rotate-90")} />
                  <span className="truncate">{t("nav.group.created")}</span>
                  <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{rooms.created.length}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("nav.create")}
                  title={t("nav.create")}
                  onClick={() => openRoomEntry("create")}
                  disabled={!canAddMoreRooms || roomEntrySubmitting}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {!createdCollapsed ? (
                <RoomLinks rooms={rooms.created} activeCode={roomCode} onToggleMenu={handleToggleRoomMenu} emptyLabel={t("nav.empty")} />
              ) : null}
            </div>
            <div>
              <div className="mb-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleJoinedCollapsed}
                  aria-expanded={!joinedCollapsed}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-xs uppercase tracking-[0.16em] text-zinc-500 hover:text-zinc-300"
                >
                  <ChevronRight className={clsx("h-3.5 w-3.5 shrink-0 transition-transform", !joinedCollapsed && "rotate-90")} />
                  <span className="truncate">{t("nav.group.joined")}</span>
                  <span className="ml-auto rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">{rooms.joined.length}</span>
                </button>
                <button
                  type="button"
                  aria-label={t("nav.join")}
                  title={t("nav.join")}
                  onClick={() => openRoomEntry("join")}
                  disabled={!canAddMoreRooms || roomEntrySubmitting}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              {!joinedCollapsed ? (
                <RoomLinks rooms={rooms.joined} activeCode={roomCode} onToggleMenu={handleToggleRoomMenu} emptyLabel={t("nav.empty")} />
              ) : null}
            </div>
          </div>
          <div className="mt-auto space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 text-xs text-zinc-400">
            <p>
              版本 <span className="font-semibold text-zinc-200">{snap.app.version}</span>
            </p>
            <p>
              开源协议 <span className="font-semibold text-zinc-200">{snap.app.openSource}</span>
            </p>
            <p>
              房间在线 <span className="font-semibold text-zinc-200">{snap.stats.roomOnline}</span>
            </p>
            <p>
              全站在线 <span className="font-semibold text-zinc-200">{snap.stats.totalOnline}</span>
            </p>
            <div className="pt-2">
              <p className="text-zinc-500">当前用户</p>
              <div className="mt-1 flex items-center gap-2">
                <Avatar initial={snap.me.avatarInitial} color={snap.me.avatarColor} />
                <span className="text-sm text-zinc-200">{snap.me.nickname}</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="order-1 flex min-h-[60vh] flex-col rounded-none border border-zinc-900 bg-zinc-950 xl:order-2 xl:h-full xl:min-h-0">
          <header className="space-y-3 border-b border-zinc-800 px-3 py-3 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-zinc-100">{snap.room.name}</h1>
                <p className="font-mono text-xs text-zinc-500">/{snap.room.roomCode}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center text-xs text-zinc-400">
                  <Users className="mr-1 inline h-3.5 w-3.5" />
                  {t("header.members", { count: snap.members.length, max: 20 })}
                </span>
                <ThemeToggle />
                <LanguageToggle />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {navVisible ? (
                <button
                  type="button"
                  onClick={() => scrollToPanel("rooms")}
                  className="inline-flex items-center rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 xl:hidden"
                >
                  房间列表
                </button>
              ) : null}
              {membersVisible ? (
                <button
                  type="button"
                  onClick={() => scrollToPanel("members")}
                  className="inline-flex items-center rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 xl:hidden"
                >
                  成员列表
                </button>
              ) : null}
              <Tooltip label={navVisible ? t("control.nav.hide") : t("control.nav.show")}>
                <IconButton
                  aria-label={navVisible ? t("control.nav.hide") : t("control.nav.show")}
                  active={navVisible}
                  onClick={toggleNavCollapsed}
                >
                  <PanelLeft className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip label={t("header.invite")}>
                <IconButton aria-label={t("header.invite")} onClick={copyLink}>
                  <Copy className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip label={t("header.qr")}>
                <IconButton aria-label={t("header.qr")} onClick={() => setShowQr(true)}>
                  <QrCode className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip label={isOwner ? t("header.announcement.edit") : t("header.announcement.view")}>
                <IconButton aria-label={t("header.announcement")} onClick={isOwner ? openNoticeEditor : openNoticeViewer}>
                  <Megaphone className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              <Tooltip label={membersVisible ? t("control.members.hide") : t("control.members.show")}>
                <IconButton
                  aria-label={membersVisible ? t("control.members.hide") : t("control.members.show")}
                  active={membersVisible}
                  onClick={toggleMembersCollapsed}
                >
                  <Users className="h-4 w-4" />
                </IconButton>
              </Tooltip>
              {isOwner ? (
                <Tooltip label={t("header.settings")}>
                  <IconButton
                    aria-label={t("header.settings")}
                    active={settingsOpen}
                    onClick={() => setSettingsOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {isOwner ? (
                <Tooltip label={action === "dissolve" ? t("header.dissolving") : t("header.dissolve")}>
                  <IconButton
                    aria-label={t("header.dissolve")}
                    danger
                    onClick={dissolve}
                    disabled={action === "dissolve"}
                  >
                    {action === "dissolve" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </IconButton>
                </Tooltip>
              ) : null}
            </div>
            <AdCarousel items={snap.adBoard.items} />
            {hint ? <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-xs text-zinc-200">{hint}</div> : null}
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            {snap.messages.length === 0 && pendingMessages.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-500">
                {t("chat.empty")}
              </div>
            ) : null}

            {snap.messages.map((m) => {
              const isOwnMessage = m.sender.id === snap.me.id;
              const deliveryState = getMessageDeliveryState(m);
              const expanded = Boolean(expandedMessageIds[m.id]);
              const collapsed = isMessageCollapsed(m.content, expanded);
              const copyKey = `message-${m.id}`;
              return (
                <MessageBubble
                  key={m.id}
                  own={isOwnMessage}
                  avatarInitial={m.sender.avatarInitial}
                  avatarColor={m.sender.avatarColor}
                  nickname={m.sender.nickname}
                  createdAt={m.createdAt}
                  metaSlot={
                    isOwnMessage && deliveryState === "sent" ? (
                      <Check className="h-3.5 w-3.5 text-zinc-300" />
                    ) : isOwnMessage && deliveryState === "read" ? (
                      <CheckCheck className="h-3.5 w-3.5 text-zinc-300" />
                    ) : null
                  }
                  content={m.content}
                  collapsed={collapsed}
                  visibleContent={collapsed ? `${getCollapsedPreviewText(m.content)}...` : m.content}
                  onToggleExpand={() => setExpandedMessageIds((prev) => ({ ...prev, [m.id]: !expanded }))}
                  onCopy={() => void copyMessageText(m.content, copyKey)}
                  copied={Boolean(copiedTextKeys[copyKey])}
                  labels={{ copy: t("chat.copy"), copied: t("chat.copied"), expand: t("chat.expand"), collapse: t("chat.collapse") }}
                  attachments={m.attachments}
                  renderAttachmentAction={(a) => <FileAction roomCode={roomCode} attachment={a as AttachmentItem} />}
                  onOpenImage={openImageViewer}
                />
              );
            })}

            {pendingMessages.map((message) => {
              const expanded = Boolean(expandedPendingMessageIds[message.localId]);
              const collapsed = isMessageCollapsed(message.content, expanded);
              const copyKey = `pending-${message.localId}`;
              return (
                <MessageBubble
                  key={message.localId}
                  own
                  avatarInitial={snap.me.avatarInitial}
                  avatarColor={snap.me.avatarColor}
                  nickname={snap.me.nickname}
                  createdAt={message.createdAt}
                  metaSlot={
                    message.status === "sending" ? (
                      <>
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-zinc-300" />
                        <span>{message.progress}%</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5 text-red-300" />
                        <span>{t("chat.sendFailed")}</span>
                      </>
                    )
                  }
                  content={message.content}
                  collapsed={collapsed}
                  visibleContent={collapsed ? `${getCollapsedPreviewText(message.content)}...` : message.content}
                  onToggleExpand={() => setExpandedPendingMessageIds((prev) => ({ ...prev, [message.localId]: !expanded }))}
                  onCopy={() => void copyMessageText(message.content, copyKey)}
                  copied={Boolean(copiedTextKeys[copyKey])}
                  labels={{ copy: t("chat.copy"), copied: t("chat.copied"), expand: t("chat.expand"), collapse: t("chat.collapse") }}
                  attachments={message.attachments}
                  onOpenImage={openImageViewer}
                  footerSlot={
                    message.status === "failed" && message.error ? (
                      <p className="mt-2 text-xs text-red-300">{message.error}</p>
                    ) : null
                  }
                />
              );
            })}
            <div ref={endRef} />
          </div>

          <form ref={composerFormRef} onSubmit={send} className="border-t border-zinc-800 p-3 sm:p-4">
            {files.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span
                    key={`${file.name}-${file.size}-${index}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== index))}
                      className="rounded-full p-0.5 hover:bg-zinc-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl border border-zinc-700 bg-zinc-900/90 p-2">
              <textarea
                value={text}
                onChange={(e) => setText(clampMessageText(e.target.value))}
                onPaste={onPaste}
                onKeyDown={onComposerKeyDown}
                maxLength={MAX_MESSAGE_TEXT_CHARS}
                placeholder="输入框支持 Ctrl+V 粘贴文本或文件；图片/视频可预览，其它文件仅下载。"
                className="min-h-[96px] w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 px-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800">
                    <Plus className="h-3.5 w-3.5" />
                    文件
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          addFiles(e.target.files);
                          e.target.value = "";
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={readClipboard}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-700 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    读取剪贴板
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enterToSend}
                    onClick={() => setEnterToSend((prev) => !prev)}
                    className={clsx(
                      "inline-flex h-8 items-center rounded-lg border px-2.5 text-xs",
                      enterToSend
                        ? "border-zinc-500/50 bg-zinc-500/15 text-zinc-100"
                        : "border-zinc-700 text-zinc-300 hover:bg-zinc-800",
                    )}
                  >
                    回车发送内容：{enterToSend ? "开" : "关"}
                  </button>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[11px] text-zinc-500">
                    {text.length}/{MAX_MESSAGE_TEXT_CHARS}
                  </span>
                  <button
                    type="submit"
                    className="btn-primary inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium"
                  >
                    <SendHorizonal className="h-3.5 w-3.5" />
                    发送
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        <aside
          ref={membersPanelRef}
          className={clsx(
            "order-3 min-h-0 max-h-[56vh] flex-col rounded-none border border-zinc-900 bg-zinc-950 p-4 xl:order-3 xl:max-h-none",
            membersVisible ? "flex" : "hidden",
          )}
        >
            <div className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  {isOwner ? t("members.manage") : t("members.list")}
                </p>
                <Tooltip label={t("members.collapse")}>
                  <IconButton
                    aria-label={t("members.collapse")}
                    className="h-7 w-7"
                    onClick={toggleMembersCollapsed}
                  >
                    <PanelRightClose className="h-4 w-4" />
                  </IconButton>
                </Tooltip>
              </div>
              {isOwner ? (
                <div className="segmented mt-2 grid grid-cols-2 gap-1 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMemberMenuId(null);
                      setMemberPanelTab("members");
                    }}
                    className="segmented-item px-2 py-1.5 text-xs font-medium"
                    data-active={memberPanelTab === "members"}
                  >
                    {t("members.tab.members")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMemberMenuId(null);
                      setMemberPanelTab("approvals");
                    }}
                    className="segmented-item px-2 py-1.5 text-xs font-medium"
                    data-active={memberPanelTab === "approvals"}
                  >
                    {t("members.tab.approvals")}
                  </button>
                </div>
              ) : null}
            </div>

            {memberPanelTab === "members" || !isOwner ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <h2 className="mb-2 text-lg font-semibold text-zinc-100">{t("members.count", { count: snap.members.length })}</h2>
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {snap.members.map((m) => (
                    <div key={m.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar initial={m.user.avatarInitial} color={m.user.avatarColor} className="h-7 w-7" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-zinc-200">{m.user.nickname}</p>
                            <p className="text-xs text-zinc-500">
                              {m.role === "OWNER" ? t("members.role.owner") : t("members.role.member")} · {m.joinedAt ? fmt(m.joinedAt) : "--"}
                            </p>
                          </div>
                        </div>
                        {isOwner && m.role !== "OWNER" ? (
                          <div
                            ref={openMemberMenuId === m.id ? memberMenuRef : null}
                            className="relative shrink-0"
                          >
                            <button
                              type="button"
                              aria-label="成员操作"
                              aria-haspopup="menu"
                              aria-expanded={openMemberMenuId === m.id}
                              onClick={() => setOpenMemberMenuId((prev) => prev === m.id ? null : m.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-500/40 text-zinc-300 hover:bg-zinc-800"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {openMemberMenuId === m.id ? (
                              <div role="menu" className="absolute right-0 top-9 z-20 w-32 rounded-md border border-zinc-700 bg-zinc-900 p-1.5 shadow-2xl">
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMemberMenuId(null);
                                    void transferOwner(m);
                                  }}
                                  disabled={action === `transfer-${m.id}`}
                                  className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                                >
                                  <Crown className="h-3 w-3" /> 房主转让
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMemberMenuId(null);
                                    void kick(m);
                                  }}
                                  disabled={action === `kick-${m.id}`}
                                  className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
                                >
                                  <UserMinus className="h-3 w-3" /> 移除房间
                                </button>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {isOwner && memberPanelTab === "approvals" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <h2 className="mb-2 text-lg font-semibold text-zinc-100">{t("approvals.title")}</h2>
                <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                  {snap.pendingRequests.length === 0 ? (
                    <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                      {t("approvals.empty")}
                    </p>
                  ) : (
                    snap.pendingRequests.map((r) => (
                      <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar initial={r.user.avatarInitial} color={r.user.avatarColor} className="h-6 w-6" />
                          <div>
                            <p className="text-sm text-zinc-200">{r.user.nickname}</p>
                            <p className="text-[11px] text-zinc-500">{fmt(r.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => review(r, "approve")}
                            disabled={action === `approve-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            <Check className="h-3 w-3" /> {t("approvals.approve")}
                          </button>
                          <button
                            type="button"
                            onClick={() => review(r, "reject")}
                            disabled={action === `reject-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            <X className="h-3 w-3" /> {t("approvals.reject")}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {isOwner ? (
              <Popover
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                title={t("settings.title")}
                closeLabel={t("common.close")}
              >
                <div className="space-y-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5">
                    <p className="text-xs font-medium text-zinc-200">{t("settings.roomName")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={roomNameInput}
                        onChange={(e) => setRoomNameInput(e.target.value.slice(0, 48))}
                        placeholder={t("settings.roomName.placeholder")}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={updateRoomName}
                        disabled={action === "room-name"}
                        className="shrink-0 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                      >
                        {action === "room-name" ? t("settings.saving") : t("settings.save")}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5">
                    <p className="text-xs font-medium text-zinc-200">{t("settings.gateCode")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={gateCodeInput}
                        onChange={(e) => setGateCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder={t("settings.gateCode.placeholder")}
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
                      />
                      <button
                        type="button"
                        onClick={updateGateCode}
                        disabled={action === "gate-code"}
                        className="shrink-0 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                      >
                        {action === "gate-code" ? t("settings.saving") : t("settings.save")}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {t("settings.gateCode.current", {
                        code: snap.room.gateCode ?? t("settings.gateCode.unset"),
                      })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-zinc-200">{t("settings.joinPolicy")}</p>
                        <p className="text-[11px] text-zinc-500">{t("settings.joinPolicy.hint")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400">
                          {snap.room.allowJoinRequest ? t("settings.joinPolicy.allow") : t("settings.joinPolicy.deny")}
                        </span>
                        <SwitchBtn
                          checked={snap.room.allowJoinRequest}
                          disabled={action === "join-policy"}
                          onToggle={() => {
                            void updateJoinPolicy(!snap.room.allowJoinRequest);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-zinc-200">{t("settings.expiry")}</p>
                        <p className="text-[11px] text-zinc-500">{t("settings.expiry.hint")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-400">
                          {snap.room.neverExpire ? t("settings.expiry.on") : t("settings.expiry.off")}
                        </span>
                        <SwitchBtn
                          checked={snap.room.neverExpire}
                          disabled={action === "never-expire"}
                          onToggle={() => {
                            void updateNeverExpire(!snap.room.neverExpire);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Popover>
            ) : null}

            {error ? <p className="mt-3 text-xs text-zinc-300">{error}</p> : null}
        </aside>
      </main>

      {openRoomMenu
        ? createPortal(
          <div
            ref={floatingRoomMenuRef}
            role="menu"
            className="fixed z-[90] w-24 rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-2xl"
            style={{ top: `${openRoomMenu.top}px`, left: `${openRoomMenu.left}px` }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                void leaveRoom(openRoomMenu.room);
              }}
              disabled={action === `leave-${openRoomMenu.room.roomCode}`}
              className="inline-flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-60"
            >
              退出房间
            </button>
          </div>,
          document.body,
        )
        : null}

      {roomEntryMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">
                  {roomEntryMode === "create" ? "创建房间" : "加入房间"}
                </h3>
                <p className="mt-1 text-[11px] text-zinc-500">
                  当前已加入/创建房间数：{roomCount}/{MAX_USER_ROOMS}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRoomEntryMode(null)}
                className="rounded-md border border-zinc-700 p-1 text-zinc-300 hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {roomEntryMode === "create" ? (
              <form className="space-y-3" onSubmit={quickCreateRoom}>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">房间名称</span>
                  <input
                    required
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="输入房间名"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">门禁码（可选，6位数字）</span>
                  <input
                    value={createGateCode}
                    onChange={(event) =>
                      setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="不填则加入无需门禁码"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>
                <button
                  type="submit"
                  disabled={roomEntrySubmitting || !canAddMoreRooms}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {roomEntrySubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  创建并进入
                </button>
              </form>
            ) : (
              <form className="space-y-3" onSubmit={quickJoinRoom}>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">房间号（URL 随机码）</span>
                  <input
                    required
                    value={joinRoomCode}
                    onChange={(event) => setJoinRoomCode(event.target.value.trim())}
                    placeholder="例如：8DK1A2M7QX"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">门禁码（可选，6位数字）</span>
                  <input
                    value={joinGateCode}
                    onChange={(event) => setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="如果房间设置了门禁码则必填"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">邀请 Token（可选）</span>
                  <input
                    value={joinInviteToken}
                    onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                    placeholder="有邀请链接时填入"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>
                <button
                  type="submit"
                  disabled={roomEntrySubmitting || !canAddMoreRooms}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {roomEntrySubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  加入房间
                </button>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {showQr ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-100">房间二维码</h3>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="rounded-md border border-zinc-700 p-1 text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qr ? (
              <img src={qr} alt="room-qr" className="mx-auto h-64 w-64 rounded-lg border border-zinc-700 bg-white p-2" />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <LoaderCircle className="h-5 w-5 animate-spin text-zinc-400" />
              </div>
            )}
            <p className="mt-3 break-all text-xs text-zinc-400">{joinLink}</p>
          </section>
        </div>
      ) : null}

      {showNoticeEditor ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-100">配置公告</h3>
              <button
                type="button"
                onClick={closeNoticeEditor}
                className="rounded-md border border-zinc-700 p-1 text-zinc-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              placeholder="输入公告内容..."
              className="min-h-[120px] w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-100 outline-none"
            />

            <input
              ref={noticeImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              multiple
              onChange={(e) => {
                addNoticeImages(e.target.files);
                e.target.value = "";
              }}
            />

            <div className="mt-3">
              <div className="flex flex-wrap items-start gap-3">
                {noticeImages.map((image) => (
                  <div
                    key={image.id}
                    className="group relative h-24 w-24 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900"
                  >
                    <button
                      type="button"
                      className="h-full w-full"
                      onClick={() => openImageViewer(image.imageUrl, image.imageName)}
                      title="预览原图"
                    >
                      <img
                        src={image.imageUrl}
                        alt={image.imageName}
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeNoticeImage(image.id)}
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 bg-black/80 text-zinc-200 opacity-100 transition hover:bg-zinc-800 group-hover:opacity-100"
                      title="删除图片"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}

                {noticeImages.length < MAX_ANNOUNCEMENT_IMAGES ? (
                  <button
                    type="button"
                    onClick={() => noticeImageInputRef.current?.click()}
                    className="flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-600 bg-zinc-900/70 px-2 text-center text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    <Plus className="mb-1 h-4 w-4" />
                    上传公告图片
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                最多上传 {MAX_ANNOUNCEMENT_IMAGES} 张图片
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeNoticeEditor}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={previewNoticeDraft}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                预览
              </button>
              <button
                type="button"
                onClick={saveNotice}
                disabled={action === "notice"}
                className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                {action === "notice" ? "保存中..." : "保存公告"}
              </button>
            </div>

          </section>
        </div>
      ) : null}

      {showNoticePopup ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-lg rounded-2xl border border-zinc-400/50 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center gap-2 text-zinc-300">
              <Megaphone className="h-5 w-5" />
              <h3 className="text-base font-semibold">{isPreviewingNoticeDraft ? "公告预览" : "房间公告"}</h3>
            </div>
            {noticePopupContent.text ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-100">{noticePopupContent.text}</p>
            ) : null}
            {noticePopupContent.images.length > 0 ? (
              <div
                className={clsx(
                  "mt-3 grid gap-3",
                  noticePopupContent.images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
                )}
              >
                {noticePopupContent.images.map((image, index) => (
                  <button
                    key={`${image.imageUrl}-${index}`}
                    type="button"
                    onClick={() => openImageViewer(image.imageUrl, image.imageName ?? `announcement-${index + 1}`)}
                    className="overflow-hidden rounded-lg border border-zinc-700 bg-black"
                  >
                    <img
                      src={image.imageUrl}
                      alt={image.imageName ?? "announcement"}
                      className="max-h-[42vh] w-full object-contain"
                    />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={closeNoticePopup}
                className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-white"
              >
                {isPreviewingNoticeDraft ? "关闭预览" : "我知道了"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {imageViewer ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setImageViewer(null)}
        >
          <section
            className="w-full max-w-5xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-xs text-zinc-300">{imageViewer.fileName}</p>
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                关闭
              </button>
            </div>
            <img
              src={imageViewer.url}
              alt={imageViewer.fileName}
              className="max-h-[80vh] w-full rounded-lg border border-zinc-700 bg-black object-contain"
            />
          </section>
        </div>
      ) : null}
    </>
  );
}

