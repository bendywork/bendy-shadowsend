"use client";

/* eslint-disable @next/next/no-img-element */
import { type ClipboardEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Clock3, Copy, Download, FileText, LoaderCircle, LogOut, Megaphone, Plus, QrCode, SendHorizonal, Settings2, Shield, Trash2, UserMinus, Users, Video, X } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY } from "@/lib/constants";
import { apiFetch, formatBytes } from "@/lib/client";
import { Avatar } from "@/components/chat/avatar";
import type { AttachmentItem, BootstrapPayload, MessageItem, PendingRequestItem, RoomMemberItem, RoomSnapshot, RoomTreeItem } from "@/types/chat";

type UploadPrep = { uploadUrl: string; s3Key: string; method: "PUT"; headers: { "Content-Type": string } };
type DownloadPayload = { url: string };

const isPreviewable = (a: AttachmentItem) => a.previewType === "IMAGE" || a.previewType === "VIDEO";
const fmt = (v: string) => new Date(v).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Tree({ title, rooms, activeCode }: { title: string; rooms: RoomTreeItem[]; activeCode: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{title}</p>
      <div className="space-y-1">
        {rooms.length === 0 ? <p className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-500">暂无</p> : rooms.map((r) => (
          <Link key={r.id} href={`/room/${r.roomCode}`} className={clsx("block rounded-lg border px-3 py-2 text-sm", activeCode === r.roomCode ? "border-blue-500/60 bg-blue-500/10 text-blue-100" : "border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700") }>
            <div className="flex items-center justify-between"><span className="truncate">{r.name}</span>{r.hasGateCode ? <Shield className="h-3.5 w-3.5 text-blue-300" /> : null}</div>
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
  return <button type="button" onClick={open} disabled={loading} className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">{loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : isPreviewable(attachment) ? <Video className="h-3 w-3" /> : <Download className="h-3 w-3" />}{isPreviewable(attachment) ? "预览" : "下载"}</button>;
}

function Btn({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={clsx("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs disabled:opacity-60", danger ? "border-rose-500/40 text-rose-200 hover:bg-rose-500/10" : "border-slate-700 text-slate-200 hover:bg-slate-800")}>{icon}{label}</button>;
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
  const [sending, setSending] = useState(false);

  const [showManage, setShowManage] = useState(true);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  const [showNoticeEditor, setShowNoticeEditor] = useState(false);
  const [noticeText, setNoticeText] = useState("");
  const [noticeImage, setNoticeImage] = useState<File | null>(null);
  const [clearNoticeImage, setClearNoticeImage] = useState(false);

  const [showNoticePopup, setShowNoticePopup] = useState(false);
  const [gateCodeInput, setGateCodeInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  const isOwner = snap?.me.role === "OWNER";
  const showMembers = isOwner ? showManage : true;
  const joinLink = useMemo(() => typeof window === "undefined" ? "" : `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`, [roomCode]);

  const refresh = useCallback(async () => {
    const [b, s] = await Promise.all([apiFetch<BootstrapPayload>("/api/bootstrap"), apiFetch<RoomSnapshot>(`/api/rooms/${roomCode}`)]);
    setBoot(b); setSnap(s); setError(null);
    if (s.announcement.showToMe) setShowNoticePopup(true);
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
    if (!snap || snap.waitingApproval) return;
    const hb = window.setInterval(() => { void apiFetch<{ success: boolean }>("/api/presence", { method: "POST", body: JSON.stringify({ roomCode }) }).catch(() => undefined); }, 25000);
    const poll = window.setInterval(() => { void refresh().catch((e) => setError(e instanceof Error ? e.message : "刷新失败")); }, 4000);
    return () => { window.clearInterval(hb); window.clearInterval(poll); };
  }, [roomCode, snap, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [snap?.messages.length]);

  useEffect(() => {
    if (!showQr || !joinLink) return;
    void QRCode.toDataURL(joinLink, { width: 280, margin: 1, color: { dark: "#e5edf9", light: "#00000000" } }).then(setQr);
  }, [showQr, joinLink]);

  useEffect(() => {
    if (!snap || snap.me.role !== "OWNER") return;
    setGateCodeInput(snap.room.gateCode ?? "");
  }, [snap]);

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

  async function upload(file: File) {
    const prep = await apiFetch<UploadPrep>(`/api/rooms/${roomCode}/upload-url`, { method: "POST", body: JSON.stringify({ fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size }) });
    const r = await fetch(prep.uploadUrl, { method: prep.method, headers: prep.headers, body: file });
    if (!r.ok) throw new Error(`文件上传失败: ${file.name}`);
    return { fileName: file.name, mimeType: file.type || "application/octet-stream", sizeBytes: file.size, s3Key: prep.s3Key };
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const content = text.trim();
    if (!content && !files.length) return;
    setSending(true);
    try {
      const attachments = await Promise.all(files.map(upload));
      await apiFetch<{ message: MessageItem }>(`/api/rooms/${roomCode}/messages`, { method: "POST", body: JSON.stringify({ content: content || undefined, attachments }) });
      setText(""); setFiles([]); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "发送失败"); }
    finally { setSending(false); }
  }

  async function kick(m: RoomMemberItem) {
    if (!window.confirm(`确认将 ${m.user.nickname} 踢出房间？`)) return;
    setAction(`kick-${m.id}`);
    try { await apiFetch<{ success: boolean }>(`/api/rooms/${roomCode}/members/${m.id}/kick`, { method: "POST", body: JSON.stringify({}) }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "踢出失败"); }
    finally { setAction(null); }
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
    setNoticeImage(null); setClearNoticeImage(false); setShowNoticeEditor(true);
  }

  async function saveNotice() {
    setAction("notice");
    try {
      let image: { s3Key: string; fileName: string; mimeType: string; sizeBytes: number } | undefined;
      if (noticeImage) image = await upload(noticeImage);
      await apiFetch<{ announcement: unknown }>(`/api/rooms/${roomCode}/announcement`, { method: "POST", body: JSON.stringify({ text: noticeText || undefined, image, clearImage: clearNoticeImage }) });
      setShowNoticeEditor(false); await refresh(); setHint("公告已更新"); window.setTimeout(() => setHint(null), 2200);
    } catch (err) { setError(err instanceof Error ? err.message : "公告保存失败"); }
    finally { setAction(null); }
  }

  async function closeNoticePopup() {
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
    catch (err) { setError(err instanceof Error ? err.message : "解散失败"); }
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

  if (loading) return <main className="flex min-h-screen items-center justify-center text-slate-300"><LoaderCircle className="h-6 w-6 animate-spin" /></main>;
  if (error && !snap) return <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center"><p className="text-sm text-rose-300">{error}</p><Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200">返回首页</Link></main>;
  if (!snap) return null;
  if (snap.waitingApproval) return <main className="flex min-h-screen items-center justify-center px-4"><section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900/90 p-8 text-center"><Clock3 className="mx-auto h-8 w-8 text-amber-300" /><h1 className="mt-4 text-xl font-semibold text-slate-100">等待房主审批</h1><p className="mt-2 text-sm text-slate-400">你曾被踢出该房间，再次加入需要房主审批。</p><Link href="/" className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm text-white">返回首页</Link></section></main>;

  return (
    <>
      <main className={clsx("mx-auto grid min-h-screen w-full max-w-[1680px] grid-cols-1 gap-4 p-3 md:p-4", showMembers ? "lg:grid-cols-[290px_minmax(0,1fr)_290px]" : "lg:grid-cols-[290px_minmax(0,1fr)]") }>
        <aside className="flex min-h-[220px] flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-slate-500">房间导航</p><h2 className="text-lg font-semibold text-slate-100">已创建/已加入</h2></div><Link href="/" className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"><LogOut className="h-4 w-4" /></Link></div>
          <div className="space-y-4 overflow-y-auto pb-3"><Tree title="创建的房间" rooms={rooms.created} activeCode={roomCode} /><Tree title="加入的房间" rooms={rooms.joined} activeCode={roomCode} /></div>
          <div className="mt-auto space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-400"><p>版本 <span className="font-semibold text-slate-200">{snap.app.version}</span></p><p>开源协议 <span className="font-semibold text-slate-200">{snap.app.openSource}</span></p><p>房间在线 <span className="font-semibold text-slate-200">{snap.stats.roomOnline}</span></p><p>全站在线 <span className="font-semibold text-slate-200">{snap.stats.totalOnline}</span></p><div className="pt-2"><p className="text-slate-500">当前用户</p><div className="mt-1 flex items-center gap-2"><Avatar initial={snap.me.avatarInitial} color={snap.me.avatarColor} /><span className="text-sm text-slate-200">{snap.me.nickname}</span></div></div></div>
        </aside>

        <section className="flex min-h-[70vh] flex-col rounded-2xl border border-slate-800 bg-slate-950/90">
          <header className="space-y-3 border-b border-slate-800 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-semibold text-slate-100">{snap.room.name}</h1><p className="font-mono text-xs text-slate-500">/{snap.room.roomCode}</p></div><div className="text-xs text-slate-400"><Users className="mr-1 inline h-3.5 w-3.5" />{snap.members.length}/20 人</div></div>
            <div className="flex flex-wrap gap-2">
              <Btn icon={<Copy className="h-3.5 w-3.5" />} label="邀请" onClick={copyLink} />
              <Btn icon={<QrCode className="h-3.5 w-3.5" />} label="二维码" onClick={() => setShowQr(true)} />
              {isOwner ? <Btn icon={<Megaphone className="h-3.5 w-3.5" />} label="公告" onClick={openNoticeEditor} /> : null}
              {isOwner ? <Btn icon={<Settings2 className="h-3.5 w-3.5" />} label={showManage ? "管理(隐藏)" : "管理(显示)"} onClick={() => setShowManage((v) => !v)} /> : null}
              {isOwner ? <Btn icon={<Trash2 className="h-3.5 w-3.5" />} label={action === "dissolve" ? "解散中" : "解散"} onClick={dissolve} danger disabled={action === "dissolve"} /> : null}
            </div>
            {hint ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">{hint}</div> : null}
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {snap.messages.length === 0 ? <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-500">暂无消息，开始发送吧。</div> : snap.messages.map((m) => (
              <article key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Avatar initial={m.sender.avatarInitial} color={m.sender.avatarColor} className="h-7 w-7" /><span className="text-sm font-medium text-slate-200">{m.sender.nickname}</span></div><time className="text-[11px] text-slate-500">{fmt(m.createdAt)}</time></div>
                {m.content ? <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{m.content}</p> : null}
                {m.attachments.length ? <div className="mt-3 space-y-2">{m.attachments.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-700/80 bg-slate-900 px-2.5 py-2"><div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{a.fileName}</p><p className="text-xs text-slate-500">{a.mimeType} · {formatBytes(a.sizeBytes)}</p></div><FileAction roomCode={roomCode} attachment={a} /></div>)}</div> : null}
              </article>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="border-t border-slate-800 p-4">
            {files.length ? <div className="mb-2 flex flex-wrap gap-2">{files.map((f, i) => <span key={`${f.name}-${f.size}-${i}`} className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200"><FileText className="h-3 w-3" /><span className="max-w-[220px] truncate">{f.name}</span><button type="button" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="rounded-full p-0.5 hover:bg-slate-700"><X className="h-3 w-3" /></button></span>)}</div> : null}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/90 p-2"><textarea value={text} onChange={(e) => setText(e.target.value)} onPaste={onPaste} placeholder="粘贴文本/文件后可直接发送..." className="min-h-[96px] w-full resize-none rounded-xl bg-transparent px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500" /><div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 pb-1"><div className="flex items-center gap-2"><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /> 文件<input type="file" className="hidden" multiple onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = ""; } }} /></label><button type="button" onClick={readClipboard} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"><Copy className="h-3.5 w-3.5" /> 读取剪贴板</button></div><button type="submit" disabled={sending} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">{sending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <SendHorizonal className="h-3.5 w-3.5" />}发送</button></div></div>
            <p className="mt-2 text-xs text-slate-500">输入框支持直接 Ctrl+V 粘贴文本或文件；图片/视频可预览，其它文件仅下载。</p>
          </form>
        </section>

        {showMembers ? (
          <aside className="flex min-h-[220px] flex-col rounded-2xl border border-slate-800 bg-slate-950/90 p-4">
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
                      <button
                        type="button"
                        onClick={() => kick(m)}
                        disabled={action === `kick-${m.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 disabled:opacity-60"
                      >
                        <UserMinus className="h-3 w-3" /> 踢出
                      </button>
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
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 disabled:opacity-60"
                          >
                            <Check className="h-3 w-3" /> 通过
                          </button>
                          <button
                            type="button"
                            onClick={() => review(r, "reject")}
                            disabled={action === `reject-${r.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 disabled:opacity-60"
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
                <h3 className="mb-2 text-sm font-semibold text-slate-200">修改邀请码</h3>
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
                    className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs text-white disabled:opacity-60"
                  >
                    {action === "gate-code" ? "保存中..." : "保存"}
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  当前门禁码：{snap.room.gateCode ?? "未设置"}
                </p>
              </div>
            ) : null}

            {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
          </aside>
        ) : null}
      </main>

      {showQr ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"><section className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-950 p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-slate-100">房间二维码</h3><button type="button" onClick={() => setShowQr(false)} className="rounded-md border border-slate-700 p-1 text-slate-300"><X className="h-4 w-4" /></button></div>{qr ? <img src={qr} alt="room-qr" className="mx-auto h-64 w-64 rounded-lg border border-slate-700" /> : <div className="flex h-64 items-center justify-center"><LoaderCircle className="h-5 w-5 animate-spin text-slate-400" /></div>}<p className="mt-3 break-all text-xs text-slate-400">{joinLink}</p></section></div> : null}

      {showNoticeEditor ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"><section className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-950 p-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-base font-semibold text-slate-100">配置公告</h3><button type="button" onClick={() => setShowNoticeEditor(false)} className="rounded-md border border-slate-700 p-1 text-slate-300"><X className="h-4 w-4" /></button></div><textarea value={noticeText} onChange={(e) => setNoticeText(e.target.value)} placeholder="输入公告内容..." className="min-h-[120px] w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 outline-none" /><div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300"><label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 hover:bg-slate-800"><Plus className="h-3.5 w-3.5" /> 上传公告图片<input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setNoticeImage(f); setClearNoticeImage(false); } }} /></label><label className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5"><input type="checkbox" checked={clearNoticeImage} onChange={(e) => setClearNoticeImage(e.target.checked)} />清除当前图片</label>{noticeImage ? <span className="text-slate-400">新图片: {noticeImage.name}</span> : null}</div>{snap.announcement.imageUrl && !clearNoticeImage ? <img src={snap.announcement.imageUrl} alt={snap.announcement.imageName ?? "announcement-image"} className="mt-3 max-h-48 rounded-lg border border-slate-700 object-contain" /> : null}<div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setShowNoticeEditor(false)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300">取消</button><button type="button" onClick={saveNotice} disabled={action === "notice"} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">{action === "notice" ? "保存中..." : "保存公告"}</button></div></section></div> : null}

      {showNoticePopup && snap.announcement.showToMe ? <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"><section className="w-full max-w-lg rounded-2xl border border-amber-400/50 bg-slate-950 p-5"><div className="mb-3 flex items-center gap-2 text-amber-300"><Megaphone className="h-5 w-5" /><h3 className="text-base font-semibold">房间公告</h3></div>{snap.announcement.text ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-100">{snap.announcement.text}</p> : null}{snap.announcement.imageUrl ? <img src={snap.announcement.imageUrl} alt={snap.announcement.imageName ?? "announcement"} className="mt-3 max-h-60 rounded-lg border border-slate-700 object-contain" /> : null}<div className="mt-4 flex justify-end"><button type="button" onClick={closeNoticePopup} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white">我知道了</button></div></section></div> : null}
    </>
  );
}
