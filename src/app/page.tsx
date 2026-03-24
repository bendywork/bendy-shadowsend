"use client";

import Image from "next/image";
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

type MePayload = {
  user: {
    id: string;
    nickname: string;
    avatarInitial: string;
    avatarColor: string;
  };
};

const slogans = [
  "临时传递，阅后即散。",
  "黑白极简，信息纯粹。",
  "房间活跃，即刻续命。",
  "Temporary Bendy Online.",
];

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>("join");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [fallbackMe, setFallbackMe] = useState<MePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");

  const [typedText, setTypedText] = useState("");
  const [typedIndex, setTypedIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let alive = true;

    async function bootstrapPage() {
      try {
        const [meResult, bootstrapResult] = await Promise.allSettled([
          apiFetch<MePayload>("/api/me"),
          apiFetch<BootstrapPayload>("/api/bootstrap"),
        ]);

        if (!alive) return;

        const mePayload = meResult.status === "fulfilled" ? meResult.value.user : null;
        const bootPayload = bootstrapResult.status === "fulfilled" ? bootstrapResult.value : null;

        if (mePayload) setFallbackMe(mePayload);
        if (bootPayload) {
          setBootstrap(bootPayload);
          setFallbackMe(bootPayload.me);
        }

        if (!bootPayload && !mePayload) {
          throw new Error("初始化失败，请刷新重试");
        }

        if (!bootPayload) return;

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
            ...bootPayload.tree.createdRooms,
            ...bootPayload.tree.joinedRooms,
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
        if (alive) setLoading(false);
      }
    }

    bootstrapPage();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    const phrase = slogans[typedIndex % slogans.length];
    const interval = deleting ? 36 : 72;
    const timer = window.setTimeout(() => {
      if (!deleting) {
        const next = phrase.slice(0, typedText.length + 1);
        setTypedText(next);
        if (next === phrase) {
          window.setTimeout(() => setDeleting(true), 900);
        }
      } else {
        const next = phrase.slice(0, Math.max(0, typedText.length - 1));
        setTypedText(next);
        if (next.length === 0) {
          setDeleting(false);
          setTypedIndex((prev) => prev + 1);
        }
      }
    }, interval);

    return () => window.clearTimeout(timer);
  }, [typedText, deleting, typedIndex]);

  const roomCount = useMemo(() => {
    if (!bootstrap) return 0;
    return bootstrap.tree.createdRooms.length + bootstrap.tree.joinedRooms.length;
  }, [bootstrap]);

  const displayMe = bootstrap?.me ?? fallbackMe;

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
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-10 lg:flex lg:items-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,255,255,0.10),transparent_34%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.08),transparent_38%)]" />

      <section className="relative mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-2 lg:items-center lg:gap-10">
        <div className="flex min-h-0 items-center px-1 sm:px-4 lg:min-h-[620px]">
          <div className="w-full max-w-xl space-y-6 sm:space-y-8">
            <div className="w-full max-w-[560px]">
              <Image
                src="/2.png"
                width={500}
                height={155}
                alt="临时笨迪 Logo"
                className="theme-dark-only h-auto w-full"
                priority
              />
              <Image
                src="/2-light.png"
                width={500}
                height={155}
                alt="临时笨迪 Logo（日间）"
                className="theme-light-only h-auto w-full"
                priority
              />
            </div>

            <h2 className="text-3xl font-semibold leading-tight text-zinc-100 sm:text-5xl">
              临时信息传递空间
            </h2>

            <p className="max-w-lg text-lg leading-relaxed text-zinc-300 sm:text-2xl">
              房间 10 分钟无活跃自动销毁，信息短驻留、低负担。
            </p>

            <p className="min-h-[2.5rem] font-mono text-xl text-zinc-200 sm:text-3xl">
              {typedText}
              <span className="ml-1 inline-block h-7 w-2 animate-pulse bg-zinc-300 align-middle" />
            </p>
          </div>
        </div>

        <div className="flex min-h-0 items-center lg:min-h-[620px]">
          <section className="w-full rounded-3xl border border-zinc-800/80 bg-black/65 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:p-8">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-zinc-500">SESSION ENTRY</p>
                <h1 className="mt-2 text-3xl font-semibold text-zinc-100">临时笨迪</h1>
                <p className="mt-2 text-sm text-zinc-400">加入或创建房间，消息仅在活跃期内保留。</p>
              </div>
              {displayMe ? (
                <div className="flex w-full items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2 sm:w-auto">
                  <Avatar
                    initial={displayMe.avatarInitial}
                    color={displayMe.avatarColor}
                    className="h-10 w-10 text-sm"
                  />
                  <div>
                    <p className="text-xs text-zinc-500">当前身份</p>
                    <p className="text-sm font-medium text-zinc-100">{displayMe.nickname}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mb-5 inline-flex w-full rounded-xl border border-zinc-800 bg-zinc-950 p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setTab("join")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
                  tab === "join" ? "bg-zinc-700 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800"
                } flex-1 justify-center sm:flex-none`}
              >
                <DoorOpen className="h-4 w-4" /> 加入
              </button>
              <button
                type="button"
                onClick={() => setTab("create")}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition ${
                  tab === "create" ? "bg-zinc-700 text-zinc-100" : "text-zinc-300 hover:bg-zinc-800"
                } flex-1 justify-center sm:flex-none`}
              >
                <PlusCircle className="h-4 w-4" /> 创建
              </button>
            </div>

            {tab === "join" ? (
              <form className="space-y-4" onSubmit={handleJoin}>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">房间号（URL 随机码）</span>
                  <input
                    required
                    value={joinRoomCode}
                    onChange={(event) => setJoinRoomCode(event.target.value.trim())}
                    placeholder="例如：8DK1A2M7QX"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">门禁码（可选，6 位数字）</span>
                  <input
                    value={joinGateCode}
                    onChange={(event) =>
                      setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="如果房间设置了门禁码则必填"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">邀请 Token（可选）</span>
                  <input
                    value={joinInviteToken}
                    onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                    placeholder="有邀请链接时自动填充"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <DoorOpen className="h-4 w-4" />
                  )}
                  进入房间
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleCreate}>
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">房间名称</span>
                  <input
                    required
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="输入房间名"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-400">门禁码（可选）</span>
                  <input
                    value={createGateCode}
                    onChange={(event) =>
                      setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="不填则加入无需门禁码"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm text-zinc-100 outline-none ring-zinc-500/30 transition focus:ring"
                  />
                </label>

                <button
                  type="submit"
                  disabled={submitting || loading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  创建并进入
                </button>
              </form>
            )}

            <div className="mt-5 space-y-2 text-xs">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-zinc-400">
                当前已加入/创建房间数：
                <span className="ml-1 font-semibold text-zinc-200">{roomCount}/10</span>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-zinc-400">
                <Shield className="mr-1 inline h-3.5 w-3.5 text-zinc-300" />
                门禁码只允许 6 位数字，且最近 1 分钟不可重复创建。
              </div>
            </div>

            {info ? <p className="mt-4 text-sm text-zinc-300">{info}</p> : null}
            {error ? <p className="mt-4 text-sm text-zinc-300">{error}</p> : null}
          </section>
        </div>
      </section>
    </main>
  );
}


