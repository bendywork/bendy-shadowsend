"use client";

/* eslint-disable @next/next/no-img-element */
import { type ClipboardEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, CheckCheck, Clock3, Copy, Crown, Download, FileText, LoaderCircle, LogOut, Megaphone, Plus, QrCode, SendHorizonal, Settings2, Shield, Trash2, UserMinus, Users, X } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY, MAX_PROXY_UPLOAD_BYTES } from "@/lib/constants";
import { apiFetch, formatBytes } from "@/lib/client";
import { Avatar } from "@/components/chat/avatar";
import type { AttachmentItem, BootstrapPayload, MessageItem, PendingRequestItem, RoomMemberItem, RoomSnapshot, RoomTreeItem } from "@/types/chat";

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
  imageUrl: string | null;
  imageName: string | null;
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

function Tree({ title, rooms, activeCode }: { title: string; rooms: RoomTreeItem[]; activeCode: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="space-y-1">
        {rooms.length === 0 ? <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-500">暂无</p> : rooms.map((r) => (
          <Link key={r.id} href={`/room/${r.roomCode}`} className={clsx("block rounded-lg border px-3 py-2 text-sm", activeCode === r.roomCode ? "border-zinc-500/60 bg-zinc-500/10 text-zinc-100" : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700") }>
            <div className="flex items-center justify-between"><span className="truncate">{r.name}</span>{r.hasGateCode ? <Shield className="h-3.5 w-3.5 text-zinc-300" /> : null}</div>
            <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{r.roomCode}</p>
          </Link>
        ))}
      </div>
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
  return <button type="button" onClick={open} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">{loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}下载</button>;
}
function Btn({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={clsx("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60", danger ? "border-zinc-500/40 text-zinc-200 hover:bg-zinc-600/10" : "border-slate-700 text-slate-200 hover:bg-slate-800")}>{icon}{label}</button>;
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

  const [showManage, setShowManage] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [noticeImage, setNoticeImage] = useState<File | null>(null);
  const [noticeImagePreviewUrl, setNoticeImagePreviewUrl] = useState<string | null>(null);
  const [clearNoticeImage, setClearNoticeImage] = useState(false);

  const [showNoticePopup, setShowNoticePopup] = useState(false);
  const [noticePreview, setNoticePreview] = useState<NoticePreviewState | null>(null);
  const [gateCodeInput, setGateCodeInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const latestMessageAtRef = useRef<string | null>(null);
  const [imageViewer, setImageViewer] = useState<ImageViewerState | null>(null);

  const isOwner = snap?.me.role === "OWNER";
  const showMembers = isOwner ? showManage : true;
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
    void QRCode.toDataURL(joinLink, { width: 280, margin: 1, color: { dark: "#e5edf9", light: "#00000000" } }).then(setQr);
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
    if (!snap || snap.me.role !== "OWNER") return;
    setGateCodeInput(snap.room.gateCode ?? "");
  }, [snap]);

  useEffect(() => {
    if (!noticeImage) {
      setNoticeImagePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(noticeImage);
    setNoticeImagePreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [noticeImage]);

  const rooms = useMemo(() => ({ created: boot?.tree.createdRooms ?? [], joined: boot?.tree.joinedRooms ?? [] }), [boot]);

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
        for (const it of items) for (const tp of it.types) {
          const blob = await it.getType(tp);
          if (blob.type.startsWith("text/")) {
            const t = await blob.text();
            if (t.trim()) setText((p) => p ? `${p}\n${t}` : t);
          } else addFiles([new File([blob], `clipboard-${Date.now()}`, { type: blob.type })]);
        }
      } else {
        const t = await navigator.clipboard.readText();
        if (t.trim()) setText((p) => p ? `${p}\n${t}` : t);
      }
    } catch {}
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const fs: File[] = [];
    for (const it of e.clipboardData.items) if (it.kind === "file") { const f = it.getAsFile(); if (f) fs.push(f); }
    if (fs.length) { addFiles(fs); e.preventDefault(); }
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
    const isImage = file.type.startsWith("image/");
    if (isImage) {
      return uploadByProxy(file, onProgress);
    }

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
      ...prev,
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

  async function copyLink() {
    if (!joinLink) return;
    try { await navigator.clipboard.writeText(joinLink); setHint("当前房间加入链接已复制"); window.setTimeout(() => setHint(null), 2200); }
    catch { setError("复制失败，请检查浏览器权限"); }
  }

  function openNoticeEditor() {
    if (!snap) return;
    setNoticeText(snap.announcement.text ?? "");
    setNoticeImage(null);
    setClearNoticeImage(false);
    setNoticePreview(null);
    setShowNoticePopup(false);
    setShowNoticeEditor(true);
  }

  function openNoticeViewer() {
    if (!snap) return;
    const hasNoticeContent = Boolean(snap.announcement.text || snap.announcement.imageUrl);
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
    const draftImageUrl = clearNoticeImage
      ? null
      : noticeImagePreviewUrl ?? snap.announcement.imageUrl ?? null;
    const draftImageName = clearNoticeImage
      ? null
      : noticeImage?.name ?? snap.announcement.imageName ?? null;

    if (!draftText && !draftImageUrl) {
      setError("公告内容与图片不能同时为空");
      return;
    }

    setNoticePreview({
      text: draftText,
      imageUrl: draftImageUrl,
      imageName: draftImageName,
    });
    setShowNoticePopup(true);
  }

  async function saveNotice() {
    setAction("notice");
    try {
      let image: { s3Key: string; fileName: string; mimeType: string; sizeBytes: number; storage: AttachmentItem["storage"] } | undefined;
      if (noticeImage) image = await upload(noticeImage);
      await apiFetch<{ announcement: unknown }>(`/api/rooms/${roomCode}/announcement`, { method: "POST", body: JSON.stringify({ text: noticeText || undefined, image, clearImage: clearNoticeImage }) });
      setShowNoticeEditor(false);
      setNoticePreview(null);
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
    try { await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/dissolve`, { method: "POST", body: JSON.stringify({}) }); router.push("/"); }
    catch (err) { setError(err instanceof Error ? err.message : "瑙ｆ暎澶辫触"); }
    finally { setAction(null); }
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
      <main className="flex min-h-screen items-center justify-center text-slate-300">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (error && !snap) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-zinc-300">{error}</p>
        <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200">
          返回首页
        </Link>
      </main>
    );
  }

  if (!snap) return null;

  if (snap.waitingApproval) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/90 p-8 text-center">
          <Clock3 className="mx-auto h-8 w-8 text-zinc-300" />
          <h1 className="mt-4 text-xl font-semibold text-slate-100">等待房主审批</h1>
          <p className="mt-2 text-sm text-slate-400">你曾被移出该房间，再次加入需要房主审批。</p>
          <Link href="/" className="mt-6 inline-flex rounded-xl bg-zinc-700 px-4 py-2 text-sm text-white">
            返回首页
          </Link>
        </section>
      </main>
    );
  }

  const noticeEditorImageUrl = clearNoticeImage
    ? null
    : noticeImagePreviewUrl ?? snap.announcement.imageUrl ?? null;
  const noticeEditorImageName = clearNoticeImage
    ? null
    : noticeImage?.name ?? snap.announcement.imageName ?? null;
  const noticePopupContent = noticePreview ?? {
    text: snap.announcement.text,
    imageUrl: snap.announcement.imageUrl,
    imageName: snap.announcement.imageName,
  };
  const isPreviewingNoticeDraft = Boolean(noticePreview);

  return (
    <>
      <main className={clsx("mx-auto grid h-[100dvh] w-full max-w-[1680px] grid-cols-1 gap-4 overflow-hidden p-3 md:p-4", showMembers ? "lg:grid-cols-[290px_minmax(0,1fr)_290px]" : "lg:grid-cols-[290px_minmax(0,1fr)]") }>
        <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">房间导航</p>
              <h2 className="text-lg font-semibold text-slate-100">已创建 / 已加入</h2>
            </div>
            <Link href="/" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-4 overflow-y-auto pb-3">
            <Tree title="创建的房间" rooms={rooms.created} activeCode={roomCode} />
            <Tree title="加入的房间" rooms={rooms.joined} activeCode={roomCode} />
          </div>
          <div className="mt-auto space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400">
            <p>
              版本 <span className="font-semibold text-slate-200">{snap.app.version}</span>
            </p>
            <p>
              开源协议 <span className="font-semibold text-slate-200">{snap.app.openSource}</span>
            </p>
            <p>
              房间在线 <span className="font-semibold text-slate-200">{snap.stats.roomOnline}</span>
            </p>
            <p>
              全站在线 <span className="font-semibold text-slate-200">{snap.stats.totalOnline}</span>
            </p>
            <div className="pt-2">
              <p className="text-slate-500">当前用户</p>
              <div className="mt-1 flex items-center gap-2">
                <Avatar initial={snap.me.avatarInitial} color={snap.me.avatarColor} />
                <span className="text-sm text-slate-200">{snap.me.nickname}</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/90">
          <header className="space-y-3 border-b border-slate-800 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-slate-100">{snap.room.name}</h1>
                <p className="font-mono text-xs text-slate-500">/{snap.room.roomCode}</p>
              </div>
              <div className="text-xs text-slate-400">
                <Users className="mr-1 inline h-3.5 w-3.5" />
                {snap.members.length}/20 人
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn icon={<Copy className="h-3.5 w-3.5" />} label="邀请" onClick={copyLink} />
              <Btn icon={<QrCode className="h-3.5 w-3.5" />} label="二维码" onClick={() => setShowQr(true)} />
              <Btn icon={<Megaphone className="h-3.5 w-3.5" />} label="公告" onClick={isOwner ? openNoticeEditor : openNoticeViewer} />
              {isOwner ? <Btn icon={<Settings2 className="h-3.5 w-3.5" />} label={showManage ? "管理(隐藏)" : "管理(显示)"} onClick={() => setShowManage((v) => !v)} /> : null}
              {isOwner ? <Btn icon={<Trash2 className="h-3.5 w-3.5" />} label={action === "dissolve" ? "解散中..." : "解散"} onClick={dissolve} danger disabled={action === "dissolve"} /> : null}
            </div>
            {hint ? <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-xs text-zinc-200">{hint}</div> : null}
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {snap.messages.length === 0 && pendingMessages.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">
                暂无消息，开始发送吧。
              </div>
            ) : null}

            {snap.messages.map((m) => {
              const isOwnMessage = m.sender.id === snap.me.id;
              const deliveryState = getMessageDeliveryState(m);
              return (
                <article key={m.id} className={clsx("flex", isOwnMessage ? "justify-end" : "justify-start")}>
                  <div
                    className={clsx(
                      "w-full max-w-[85%] rounded-xl border p-3",
                      isOwnMessage
                        ? "border-zinc-500/40 bg-zinc-500/10"
                        : "border-slate-800 bg-slate-900/60",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Avatar
                          initial={m.sender.avatarInitial}
                          color={m.sender.avatarColor}
                          className="h-7 w-7"
                        />
                        <span className="text-sm font-medium text-slate-200">{m.sender.nickname}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-slate-500">
                        <time>{fmt(m.createdAt)}</time>
                        {isOwnMessage && deliveryState === "sent" ? (
                          <Check className="h-3.5 w-3.5 text-slate-300" />
                        ) : null}
                        {isOwnMessage && deliveryState === "read" ? (
                          <CheckCheck className="h-3.5 w-3.5 text-zinc-300" />
                        ) : null}
                      </div>
                    </div>

                    {m.content ? (
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{m.content}</p>
                    ) : null}

                    {m.attachments.length ? (
                      <div className="mt-3 space-y-2">
                        {m.attachments.map((a) => (
                          <div
                            key={a.id}
                            className="rounded-lg border border-slate-700/80 bg-slate-900 p-2.5"
                          >
                            {hasInlinePreview(a) ? (
                              <div className="mb-2 overflow-hidden rounded-md border border-slate-700 bg-black">
                                {a.previewType === "IMAGE" ? (
                                  <img
                                    src={a.previewUrl ?? ""}
                                    alt={a.fileName}
                                    className="max-h-[360px] w-full cursor-zoom-in object-contain"
                                    loading="lazy"
                                    onDoubleClick={() => openImageViewer(a.previewUrl, a.fileName)}
                                  />
                                ) : (
                                  <video
                                    src={a.previewUrl ?? ""}
                                    controls
                                    preload="metadata"
                                    className="max-h-[360px] w-full"
                                  />
                                )}
                              </div>
                            ) : null}

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm text-slate-200">{a.fileName}</p>
                                <p className="text-xs text-slate-500">{a.mimeType} | {formatBytes(a.sizeBytes)}</p>
                              </div>
                              <FileAction roomCode={roomCode} attachment={a} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {pendingMessages.map((message) => (
              <article key={message.localId} className="flex justify-end">
                <div className="w-full max-w-[85%] rounded-xl border border-zinc-500/40 bg-zinc-500/10 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Avatar
                        initial={snap.me.avatarInitial}
                        color={snap.me.avatarColor}
                        className="h-7 w-7"
                      />
                      <span className="text-sm font-medium text-slate-200">{snap.me.nickname}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <time>{fmt(message.createdAt)}</time>
                      {message.status === "sending" ? (
                        <>
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-slate-300" />
                          <span>{message.progress}%</span>
                        </>
                      ) : (
                        <>
                          <X className="h-3.5 w-3.5 text-red-300" />
                          <span>发送失败</span>
                        </>
                      )}
                    </div>
                  </div>

                  {message.content ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">
                      {message.content}
                    </p>
                  ) : null}

                  {message.attachments.length ? (
                    <div className="mt-3 space-y-2">
                      {message.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="rounded-lg border border-slate-700/80 bg-slate-900 p-2.5"
                        >
                          {hasInlinePreview(attachment) ? (
                            <div className="mb-2 overflow-hidden rounded-md border border-slate-700 bg-black">
                              {attachment.previewType === "IMAGE" ? (
                                <img
                                  src={attachment.previewUrl ?? ""}
                                  alt={attachment.fileName}
                                  className="max-h-[360px] w-full cursor-zoom-in object-contain"
                                  loading="lazy"
                                  onDoubleClick={() =>
                                    openImageViewer(attachment.previewUrl, attachment.fileName)
                                  }
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

                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-200">{attachment.fileName}</p>
                            <p className="text-xs text-slate-500">
                              {attachment.mimeType} | {formatBytes(attachment.sizeBytes)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {message.status === "failed" && message.error ? (
                    <p className="mt-2 text-xs text-red-300">{message.error}</p>
                  ) : null}
                </div>
              </article>
            ))}            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="border-t border-slate-800 p-4">
            {files.length ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {files.map((file, index) => (
                  <span
                    key={`${file.name}-${file.size}-${index}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== index))}
                      className="rounded-full p-0.5 hover:bg-slate-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={onPaste}
                placeholder="粘贴文本/文件后可直接发送..."
                className="min-h-[96px] w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                <div className="flex items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
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
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    读取剪贴板
                  </button>
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                >
                  <SendHorizonal className="h-3.5 w-3.5" />
                  发送
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              输入框支持直接 Ctrl+V 粘贴文本或文件；图片/视频可预览，其它文件仅下载。
            </p>
          </form>
        </section>

        {showMembers ? (
          <aside className="flex min-h-0 flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">成员列表</p>
              <h2 className="text-lg font-semibold text-slate-100">{snap.members.length} 人</h2>
            </div>

            <div className="space-y-2 overflow-y-auto">
              {snap.members.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar initial={m.user.avatarInitial} color={m.user.avatarColor} className="h-7 w-7" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{m.user.nickname}</p>
                        <p className="text-xs text-slate-500">
                          {m.role === "OWNER" ? "房主" : "成员"} · {m.joinedAt ? fmt(m.joinedAt) : "--"}
                        </p>
                      </div>
                    </div>
                    {isOwner && m.role !== "OWNER" ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => transferOwner(m)}
                          disabled={action === `transfer-${m.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                        >
                          <Crown className="h-3 w-3" /> 转让
                        </button>
                        <button
                          type="button"
                          onClick={() => kick(m)}
                          disabled={action === `kick-${m.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                        >
                          <UserMinus className="h-3 w-3" /> 移出
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {isOwner ? (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-200">再次加入审批</h3>
                <div className="space-y-2">
                  {snap.pendingRequests.length === 0 ? (
                    <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-500">
                      暂无待审批
                    </p>
                  ) : (
                    snap.pendingRequests.map((r) => (
                      <div key={r.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
                        <div className="mb-2 flex items-center gap-2">
                          <Avatar initial={r.user.avatarInitial} color={r.user.avatarColor} className="h-6 w-6" />
                          <div>
                            <p className="text-sm text-slate-200">{r.user.nickname}</p>
                            <p className="text-[11px] text-slate-500">{fmt(r.createdAt)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => review(r, "approve")}
                            disabled={action === `approve-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            <Check className="h-3 w-3" /> 通过
                          </button>
                          <button
                            type="button"
                            onClick={() => review(r, "reject")}
                            disabled={action === `reject-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-zinc-500/40 px-2 py-1 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            <X className="h-3 w-3" /> 拒绝
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            {isOwner ? (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <h3 className="mb-2 text-sm font-semibold text-slate-200">修改门禁码</h3>
                <div className="flex items-center gap-2">
                  <input
                    value={gateCodeInput}
                    onChange={(e) => setGateCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6位数字，留空表示不设置"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 outline-none"
                  />
                  <button
                    type="button"
                    onClick={updateGateCode}
                    disabled={action === "gate-code"}
                    className="shrink-0 rounded-lg bg-zinc-700 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    {action === "gate-code" ? "保存中..." : "保存"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  当前门禁码：{snap.room.gateCode ?? "未设置"}
                </p>
              </div>
            ) : null}

            {isOwner ? (
              <div className="mt-3 rounded-lg border border-slate-700/80 bg-slate-900/80 p-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-200">永不过期</p>
                    <p className="text-[11px] text-slate-500">开启后房间不会因长时间无活动自动解散</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snap.room.neverExpire}
                    onClick={() => {
                      void updateNeverExpire(!snap.room.neverExpire);
                    }}
                    disabled={action === "never-expire"}
                    className={clsx(
                      "inline-flex shrink-0 items-center rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60",
                      snap.room.neverExpire
                        ? "border-zinc-500/50 bg-zinc-500/20 text-zinc-100"
                        : "border-slate-700 text-slate-300 hover:bg-slate-800",
                    )}
                  >
                    {action === "never-expire"
                      ? "保存中..."
                      : snap.room.neverExpire
                        ? "已开启"
                        : "已关闭"}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-zinc-300">{error}</p> : null}
          </aside>
        ) : null}
      </main>

      {showQr ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">房间二维码</h3>
              <button
                type="button"
                onClick={() => setShowQr(false)}
                className="rounded-md border border-slate-700 p-1 text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {qr ? (
              <img src={qr} alt="room-qr" className="mx-auto h-64 w-64 rounded-lg border border-slate-700" />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <LoaderCircle className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            )}
            <p className="mt-3 break-all text-xs text-slate-400">{joinLink}</p>
          </section>
        </div>
      ) : null}

      {showNoticeEditor ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">配置公告</h3>
              <button
                type="button"
                onClick={() => setShowNoticeEditor(false)}
                className="rounded-md border border-slate-700 p-1 text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <textarea
              value={noticeText}
              onChange={(e) => setNoticeText(e.target.value)}
              placeholder="输入公告内容..."
              className="min-h-[120px] w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 hover:bg-slate-800">
                <Plus className="h-3.5 w-3.5" />
                上传公告图片
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setNoticeImage(file);
                      setClearNoticeImage(false);
                    }
                  }}
                />
              </label>
              <label className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5">
                <input
                  type="checkbox"
                  checked={clearNoticeImage}
                  onChange={(e) => setClearNoticeImage(e.target.checked)}
                />
                清除当前图片
              </label>
              {noticeImage ? <span className="text-slate-400">新图片: {noticeImage.name}</span> : null}
            </div>

            {noticeEditorImageUrl ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-700 bg-black">
                <img
                  src={noticeEditorImageUrl}
                  alt={noticeEditorImageName ?? "announcement-image"}
                  className="max-h-60 w-full object-contain"
                />
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNoticeEditor(false)}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300"
              >
                取消
              </button>
              <button
                type="button"
                onClick={previewNoticeDraft}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
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
          <section className="w-full max-w-lg rounded-2xl border border-zinc-400/50 bg-slate-950 p-5">
            <div className="mb-3 flex items-center gap-2 text-zinc-300">
              <Megaphone className="h-5 w-5" />
              <h3 className="text-base font-semibold">{isPreviewingNoticeDraft ? "公告预览" : "房间公告"}</h3>
            </div>
            {noticePopupContent.text ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{noticePopupContent.text}</p>
            ) : null}
            {noticePopupContent.imageUrl ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-700 bg-black">
                <img
                  src={noticePopupContent.imageUrl}
                  alt={noticePopupContent.imageName ?? "announcement"}
                  className="max-h-[60vh] w-full cursor-zoom-in object-contain"
                  onDoubleClick={() =>
                    openImageViewer(noticePopupContent.imageUrl, noticePopupContent.imageName ?? "announcement")
                  }
                />
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
              <p className="truncate text-xs text-slate-300">{imageViewer.fileName}</p>
              <button
                type="button"
                onClick={() => setImageViewer(null)}
                className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
              >
                关闭
              </button>
            </div>
            <img
              src={imageViewer.url}
              alt={imageViewer.fileName}
              className="max-h-[80vh] w-full rounded-lg border border-slate-700 bg-black object-contain"
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
