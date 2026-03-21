"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle, PlusCircle, Shield, Sparkles } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY } from "@/lib/constants";
import { apiFetch } from "@/lib/client";
import type { BootstrapPayload } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";

type JoinResult = {
  joined: boolean;
  waitingApproval?: boolean;
  roomCode?: string;
};

type CreateResult = {
  room: {
    roomCode: string;
  };
};

type TabType = "join" | "create";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>("join");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");

  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");

  useEffect(() => {
    let alive = true;

    async function bootstrapPage() {
      try {
        const payload = await apiFetch<BootstrapPayload>("/api/bootstrap");
        if (!alive) return;

        setBootstrap(payload);

        const search = new URLSearchParams(window.location.search);
        const queryRoom = search.get("room");
        const queryInvite = search.get("invite");

        if (queryRoom) {
          setJoinRoomCode(queryRoom);
          setJoinInviteToken(queryInvite ?? "");
          setTab("join");
          setInfo(queryInvite ? "检测到邀请链接，可直接加入" : null);
        } else {
          const roomCandidates = [
            ...payload.tree.createdRooms,
            ...payload.tree.joinedRooms,
          ].map((item) => item.roomCode);

          const cached = localStorage.getItem(LAST_ROOM_STORAGE_KEY);
          if (cached && roomCandidates.includes(cached)) {
            router.replace(`/room/${cached}`);
            return;
          }
        }
      } catch (fetchError) {
        if (!alive) return;
        setError(fetchError instanceof Error ? fetchError.message : "初始化失败");
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    bootstrapPage();

    return () => {
      alive = false;
    };
  }, [router]);

  const roomCount = useMemo(() => {
    if (!bootstrap) return 0;
    return bootstrap.tree.createdRooms.length + bootstrap.tree.joinedRooms.length;
  }, [bootstrap]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      const payload = await apiFetch<CreateResult>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: createName,
          gateCode: createGateCode || undefined,
        }),
      });

      localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.room.roomCode);
      router.push(`/room/${payload.room.roomCode}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建房间失败");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      const payload = await apiFetch<JoinResult>(`/api/rooms/${joinRoomCode}/join`, {
        method: "POST",
        body: JSON.stringify({
          gateCode: joinGateCode || undefined,
          inviteToken: joinInviteToken || undefined,
        }),
      });

      if (payload.waitingApproval) {
        setInfo("已提交加入申请，等待房主审批。");
        return;
      }

      if (payload.joined && payload.roomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "加入房间失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(57,139,255,0.22),transparent_54%)]" />

      <section className="relative w-full max-w-xl rounded-3xl border border-slate-700/70 bg-slate-950/90 p-6 shadow-[0_20px_90px_rgba(2,10,30,0.55)] backdrop-blur-xl sm:p-8">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-blue-300/80">Temporary Encrypt Chat</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-50">临时笨迪</h1>
            <p className="mt-2 text-sm text-slate-400">临时信息传递空间，房间会在无活跃 10 分钟后自动销毁。</p>
          </div>
          {bootstrap?.me ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/80 px-3 py-2">
              <Avatar
                initial={bootstrap.me.avatarInitial}
                color={bootstrap.me.avatarColor}
                className="h-10 w-10 text-sm"
              />
              <div>
                <p className="text-xs text-slate-500">当前身份</p>
                <p className="text-sm font-medium text-slate-100">{bootstrap.me.nickname}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-5 inline-flex rounded-xl border border-slate-800 bg-slate-900 p-1">
          <button
            type="button"
            onClick={() => setTab("join")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
              tab === "join" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <DoorOpen className="h-4 w-4" /> 加入
          </button>
          <button
            type="button"
            onClick={() => setTab("create")}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
              tab === "create" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            <PlusCircle className="h-4 w-4" /> 创建
          </button>
        </div>

        {tab === "join" ? (
          <form className="space-y-4" onSubmit={handleJoin}>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">房间号（URL 随机码）</span>
              <input
                required
                value={joinRoomCode}
                onChange={(event) => setJoinRoomCode(event.target.value.trim())}
                placeholder="例如：8DK1A2M7QX"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-400/30 transition focus:ring"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">门禁码（可选，6 位数字）</span>
              <input
                value={joinGateCode}
                onChange={(event) => setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="如果房间设置了门禁码则必填"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-400/30 transition focus:ring"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">邀请 Token（可选）</span>
              <input
                value={joinInviteToken}
                onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                placeholder="有邀请链接时自动填充"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-400/30 transition focus:ring"
              />
            </label>

            <button
              type="submit"
              disabled={submitting || loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <DoorOpen className="h-4 w-4" />}
              进入房间
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleCreate}>
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">房间名称</span>
              <input
                required
                value={createName}
                onChange={(event) => setCreateName(event.target.value)}
                placeholder="输入房间名"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-400/30 transition focus:ring"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-slate-400">门禁码（可选）</span>
              <input
                value={createGateCode}
                onChange={(event) => setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="不填则加入无需门禁码"
                className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 outline-none ring-blue-400/30 transition focus:ring"
              />
            </label>

            <button
              type="submit"
              disabled={submitting || loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              创建并进入
            </button>
          </form>
        )}

        <div className="mt-5 space-y-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-400">
            当前已加入/创建房间数：
            <span className="ml-1 font-semibold text-slate-200">{roomCount}/10</span>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-slate-400">
            <Shield className="mr-1 inline h-3.5 w-3.5 text-blue-300" />
            门禁码只允许 6 位数字，且最近 1 分钟不可重复创建。
          </div>
        </div>

        {info ? <p className="mt-4 text-sm text-emerald-300">{info}</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </section>
    </main>
  );
}

