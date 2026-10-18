"use client";

import Image from "next/image";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle, PlusCircle, Shield, Sparkles } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY } from "@/lib/constants";
import { apiFetch } from "@/lib/client";
import type { BootstrapPayload } from "@/types/chat";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/context";
import { IdentityCard, IdentityCardSkeleton } from "@/components/home/identity-card";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { ThemeToggle } from "@/components/theme/theme-toggle";

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

export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const joinRoomInputRef = useRef<HTMLInputElement>(null);
  const createNameInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabType>("join");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [fallbackMe, setFallbackMe] = useState<MePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [infoKey, setInfoKey] = useState<MessageKey | null>(null);

  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");

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
          throw new Error("bootstrap-failed");
        }

        if (!bootPayload) return;

        const search = new URLSearchParams(window.location.search);
        const queryRoom = search.get("room");
        const queryInvite = search.get("invite");

        if (queryRoom) {
          setJoinRoomCode(queryRoom);
          setJoinInviteToken(queryInvite ?? "");
          setTab("join");
          if (queryInvite) setInfoKey("home.info.inviteDetected");
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
      } catch {
        if (!alive) return;
        setErrorKey("home.error.init");
      } finally {
        if (alive) setLoading(false);
      }
    }

    bootstrapPage();
    return () => {
      alive = false;
    };
  }, [router]);

  const displayMe = bootstrap?.me ?? fallbackMe;

  function focusEntry(nextTab: TabType) {
    setTab(nextTab);
    window.requestAnimationFrame(() => {
      const target = nextTab === "join" ? joinRoomInputRef.current : createNameInputRef.current;
      target?.focus();
    });
  }

  function handleEnterRoom(roomCode: string) {
    localStorage.setItem(LAST_ROOM_STORAGE_KEY, roomCode);
    router.push(`/room/${roomCode}`);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    setErrorKey(null);
    setInfoKey(null);
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
      const message = createError instanceof Error ? createError.message : "";
      if (message) setErrorText(message);
      else setErrorKey("home.error.create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);
    setErrorKey(null);
    setInfoKey(null);
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
        setInfoKey("home.info.waitingApproval");
        return;
      }

      if (payload.joined && payload.roomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : "";
      if (message) setErrorText(message);
      else setErrorKey("home.error.join");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="home-shell">
      <div className="home-topbar">
        <LanguageToggle />
        <ThemeToggle />
      </div>

      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero__copy">
          <Image
            src="/2.png"
            width={500}
            height={155}
            alt={t("home.logo.alt")}
            className="home-hero__logo theme-dark-only"
            priority
          />
          <Image
            src="/2-light.png"
            width={500}
            height={155}
            alt={t("home.logo.altLight")}
            className="home-hero__logo theme-light-only"
            priority
          />

          <p className="home-hero__eyebrow">{t("home.hero.eyebrow")}</p>

          <h1 id="home-hero-title" className="home-hero__title">
            {t("home.hero.title.line1")}{" "}
            <span>{t("home.hero.title.line2")}</span>
          </h1>

          <p className="home-hero__lede">{t("home.hero.lede")}</p>

          <dl className="home-hero__facts">
            <div className="home-hero__fact">
              <dt>{t("home.hero.fact.lifetime.label")}</dt>
              <dd>{t("home.hero.fact.lifetime.value")}</dd>
            </div>
            <div className="home-hero__fact">
              <dt>{t("home.hero.fact.identity.label")}</dt>
              <dd>{t("home.hero.fact.identity.value")}</dd>
            </div>
            <div className="home-hero__fact">
              <dt>{t("home.hero.fact.access.label")}</dt>
              <dd>{t("home.hero.fact.access.value")}</dd>
            </div>
          </dl>

          <p className="home-hero__signature">{t("home.hero.signature")}</p>
        </div>

        <div className="home-side">
          {displayMe ? (
            <IdentityCard
              me={displayMe}
              createdRooms={bootstrap?.tree.createdRooms ?? []}
              joinedRooms={bootstrap?.tree.joinedRooms ?? []}
              roomsLoaded={Boolean(bootstrap)}
              onEnterRoom={handleEnterRoom}
              onJoin={() => focusEntry("join")}
              onCreate={() => focusEntry("create")}
            />
          ) : loading ? (
            <IdentityCardSkeleton />
          ) : null}

          <section className="surface-card home-entry" aria-labelledby="home-entry-title">
            <div className="mb-6">
              <p className="home-entry__kicker">{t("home.entry.kicker")}</p>
              <h2 id="home-entry-title" className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {t("home.entry.title")}
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">{t("home.entry.subtitle")}</p>
            </div>

          <div className="segmented mb-5 inline-flex w-full p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setTab("join")}
              data-active={tab === "join"}
              className="segmented-item flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium sm:flex-none"
            >
              <DoorOpen className="h-4 w-4" /> {t("home.tab.join")}
            </button>
            <button
              type="button"
              onClick={() => setTab("create")}
              data-active={tab === "create"}
              className="segmented-item flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium sm:flex-none"
            >
              <PlusCircle className="h-4 w-4" /> {t("home.tab.create")}
            </button>
          </div>

          {tab === "join" ? (
            <form className="space-y-4" onSubmit={handleJoin}>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">{t("home.join.roomCode.label")}</span>
                <input
                  ref={joinRoomInputRef}
                  required
                  value={joinRoomCode}
                  onChange={(event) => setJoinRoomCode(event.target.value.trim())}
                  placeholder={t("home.join.roomCode.placeholder")}
                  className="field px-4 py-2.5 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">{t("home.join.gateCode.label")}</span>
                <input
                  value={joinGateCode}
                  onChange={(event) =>
                    setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder={t("home.join.gateCode.placeholder")}
                  inputMode="numeric"
                  className="field px-4 py-2.5 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">{t("home.join.invite.label")}</span>
                <input
                  value={joinInviteToken}
                  onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                  placeholder={t("home.join.invite.placeholder")}
                  className="field px-4 py-2.5 text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={submitting || loading}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <DoorOpen className="h-4 w-4" />
                )}
                {t("home.join.submit")}
              </button>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleCreate}>
              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">{t("home.create.name.label")}</span>
                <input
                  ref={createNameInputRef}
                  required
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder={t("home.create.name.placeholder")}
                  className="field px-4 py-2.5 text-sm"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-ink-muted">{t("home.create.gateCode.label")}</span>
                <input
                  value={createGateCode}
                  onChange={(event) =>
                    setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder={t("home.create.gateCode.placeholder")}
                  inputMode="numeric"
                  className="field px-4 py-2.5 text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={submitting || loading}
                className="btn-primary inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-semibold"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {t("home.create.submit")}
              </button>
            </form>
          )}

          <div className="mt-5 space-y-2 text-xs">
            <div className="rounded-xl border border-line-subtle bg-panel/70 px-3 py-2 text-ink-muted">
              <Shield className="mr-1 inline h-3.5 w-3.5 text-ink-soft" />
              {t("home.stats.gateHint")}
            </div>
          </div>

          {infoKey ? (
            <p className="mt-4 rounded-lg border border-line-subtle bg-panel/50 px-3 py-2 text-sm text-ink-soft">
              {t(infoKey)}
            </p>
          ) : null}
          {errorText || errorKey ? (
            <p className="mt-4 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger">
              {errorText ?? (errorKey ? t(errorKey) : null)}
            </p>
          ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
