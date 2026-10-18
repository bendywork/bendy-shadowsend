"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle, PlusCircle, Shield, Sparkles } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY, MAX_USER_ROOMS } from "@/lib/constants";
import { ApiRequestError, apiFetch } from "@/lib/client";
import type { BootstrapPayload } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { FieldError } from "@/components/ui/field-error";
import { toast } from "@/lib/toast-store";
import { toastError } from "@/lib/feedback";
import {
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "@/lib/form-validation";
import { useT } from "@/lib/i18n/context";

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

type JoinFieldErrors = {
  roomCode?: string;
  gateCode?: string;
};

type CreateFieldErrors = {
  name?: string;
  gateCode?: string;
};

const sloganKeys = [
  "home.slogan.1",
  "home.slogan.2",
  "home.slogan.3",
  "home.slogan.4",
] as const;

export default function HomePage() {
  const router = useRouter();
  const t = useT();
  const translateRef = useRef(t);
  const [tab, setTab] = useState<TabType>("join");
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [fallbackMe, setFallbackMe] = useState<MePayload["user"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [joinErrors, setJoinErrors] = useState<JoinFieldErrors>({});
  const [createErrors, setCreateErrors] = useState<CreateFieldErrors>({});

  const [createName, setCreateName] = useState("");
  const [createGateCode, setCreateGateCode] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinGateCode, setJoinGateCode] = useState("");
  const [joinInviteToken, setJoinInviteToken] = useState("");

  const [typedText, setTypedText] = useState("");
  const [typedIndex, setTypedIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    translateRef.current = t;
  }, [t]);

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
          const reason =
            meResult.status === "rejected"
              ? meResult.reason
              : bootstrapResult.status === "rejected"
                ? bootstrapResult.reason
                : null;
          throw reason ?? new ApiRequestError("initialize-failed", { code: "INVALID_RESPONSE" });
        }

        if (!bootPayload) return;

        const search = new URLSearchParams(window.location.search);
        const queryRoom = search.get("room");
        const queryInvite = search.get("invite");

        if (queryRoom) {
          setJoinRoomCode(queryRoom);
          setJoinInviteToken(queryInvite ?? "");
          setTab("join");
          if (queryInvite) {
            toast.info(translateRef.current("toast.inviteDetected"));
          }
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
        toastError(
          fetchError,
          translateRef.current("toast.initFailed"),
          translateRef.current,
        );
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
    const phrase = translateRef.current(sloganKeys[typedIndex % sloganKeys.length]);
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

  function validateJoinFields(): boolean {
    const roomCodeError = validateRoomCode(joinRoomCode);
    const gateCodeError = validateGateCode(joinGateCode);

    setJoinErrors({
      ...(roomCodeError ? { roomCode: t(roomCodeError) } : {}),
      ...(gateCodeError ? { gateCode: t(gateCodeError) } : {}),
    });

    return !roomCodeError && !gateCodeError;
  }

  function validateCreateFields(): boolean {
    const nameError = validateRoomName(createName);
    const gateCodeError = validateGateCode(createGateCode);

    setCreateErrors({
      ...(nameError ? { name: t(nameError) } : {}),
      ...(gateCodeError ? { gateCode: t(gateCodeError) } : {}),
    });

    return !nameError && !gateCodeError;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateCreateFields()) return;
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
      toastError(createError, t("toast.createRoomFailed"), t);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateJoinFields()) return;
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
        toast.info(t("toast.joinRequestSent"));
        return;
      }

      if (payload.joined && payload.roomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      toastError(joinError, t("toast.joinRoomFailed"), t);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-10 lg:flex lg:items-center">
      <section className="relative mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
        <div className="flex min-h-0 items-center px-1 sm:px-3 lg:min-h-[560px]">
          <div className="w-full max-w-xl space-y-6 sm:space-y-7">
            <div className="w-full max-w-[440px]">
              <Image
                src="/2.png"
                width={500}
                height={155}
                alt={t("home.logoAlt")}
                className="theme-dark-only h-auto w-full"
                priority
              />
              <Image
                src="/2-light.png"
                width={500}
                height={155}
                alt={t("home.logoAltLight")}
                className="theme-light-only h-auto w-full"
                priority
              />
            </div>

            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              {t("home.tagline")}
            </h2>

            <p className="max-w-md text-base leading-relaxed text-ink-muted sm:text-lg">
              {t("home.description")}
            </p>

            <p className="min-h-[2rem] font-mono text-base text-ink-faint sm:text-lg">
              {typedText}
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink-muted align-middle sm:h-5" />
            </p>
          </div>
        </div>

        <div className="flex min-h-0 items-center lg:min-h-[560px]">
          <section className="surface-card w-full p-6 sm:p-7">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-faint">{t("home.sessionEntry")}</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{t("home.appName")}</h1>
                <p className="mt-1.5 text-sm text-ink-muted">{t("home.subtitle")}</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <ThemeToggle />
                {displayMe ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-panel/80 px-3 py-2">
                    <Avatar
                      initial={displayMe.avatarInitial}
                      color={displayMe.avatarColor}
                      className="h-10 w-10 text-sm"
                    />
                    <div>
                      <p className="text-xs text-ink-faint">{t("home.currentIdentity")}</p>
                      <p className="text-sm font-medium text-ink">{displayMe.nickname}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="segmented mb-5 inline-flex w-full p-1 sm:w-auto">
              <button
                type="button"
                onClick={() => setTab("join")}
                data-active={tab === "join"}
                className="segmented-item flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium sm:flex-none"
              >
                <DoorOpen className="h-4 w-4" /> {t("entry.tab.join")}
              </button>
              <button
                type="button"
                onClick={() => setTab("create")}
                data-active={tab === "create"}
                className="segmented-item flex flex-1 items-center justify-center gap-2 px-4 py-2 text-sm font-medium sm:flex-none"
              >
                <PlusCircle className="h-4 w-4" /> {t("entry.tab.create")}
              </button>
            </div>

            {tab === "join" ? (
              <form className="space-y-4" onSubmit={handleJoin} noValidate>
                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">{t("entry.roomCode")}</span>
                  <input
                    value={joinRoomCode}
                    onChange={(event) => {
                      setJoinRoomCode(event.target.value.trim());
                      if (joinErrors.roomCode) {
                        setJoinErrors((prev) => ({ ...prev, roomCode: undefined }));
                      }
                    }}
                    placeholder={t("entry.roomCode.placeholder")}
                    className="field px-4 py-2.5 text-sm"
                    aria-invalid={joinErrors.roomCode ? true : undefined}
                    aria-describedby={joinErrors.roomCode ? "home-join-room-code-error" : undefined}
                  />
                  <FieldError id="home-join-room-code-error" message={joinErrors.roomCode} />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">{t("entry.gateCode.join")}</span>
                  <input
                    value={joinGateCode}
                    onChange={(event) => {
                      setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      if (joinErrors.gateCode) {
                        setJoinErrors((prev) => ({ ...prev, gateCode: undefined }));
                      }
                    }}
                    placeholder={t("entry.gateCode.join.placeholder")}
                    className="field px-4 py-2.5 text-sm"
                    inputMode="numeric"
                    aria-invalid={joinErrors.gateCode ? true : undefined}
                    aria-describedby={joinErrors.gateCode ? "home-join-gate-code-error" : undefined}
                  />
                  <FieldError id="home-join-gate-code-error" message={joinErrors.gateCode} />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">{t("entry.inviteToken")}</span>
                  <input
                    value={joinInviteToken}
                    onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                    placeholder={t("entry.inviteToken.placeholder")}
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
                  {t("entry.join.submit")}
                </button>
              </form>
            ) : (
              <form className="space-y-4" onSubmit={handleCreate} noValidate>
                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">{t("entry.name")}</span>
                  <input
                    value={createName}
                    onChange={(event) => {
                      setCreateName(event.target.value);
                      if (createErrors.name) {
                        setCreateErrors((prev) => ({ ...prev, name: undefined }));
                      }
                    }}
                    placeholder={t("entry.name.placeholder")}
                    className="field px-4 py-2.5 text-sm"
                    maxLength={48}
                    aria-invalid={createErrors.name ? true : undefined}
                    aria-describedby={createErrors.name ? "home-create-name-error" : undefined}
                  />
                  <FieldError id="home-create-name-error" message={createErrors.name} />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-ink-muted">{t("entry.gateCode.create")}</span>
                  <input
                    value={createGateCode}
                    onChange={(event) => {
                      setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                      if (createErrors.gateCode) {
                        setCreateErrors((prev) => ({ ...prev, gateCode: undefined }));
                      }
                    }}
                    placeholder={t("entry.gateCode.create.placeholder")}
                    className="field px-4 py-2.5 text-sm"
                    inputMode="numeric"
                    aria-invalid={createErrors.gateCode ? true : undefined}
                    aria-describedby={createErrors.gateCode ? "home-create-gate-code-error" : undefined}
                  />
                  <FieldError id="home-create-gate-code-error" message={createErrors.gateCode} />
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
                  {t("entry.create.submit")}
                </button>
              </form>
            )}

            <div className="mt-5 space-y-2 text-xs">
              <div className="rounded-xl border border-line-subtle bg-panel/70 px-3 py-2 text-ink-muted">
                {t("entry.roomCount", { count: roomCount, max: MAX_USER_ROOMS })}
              </div>
              <div className="rounded-xl border border-line-subtle bg-panel/70 px-3 py-2 text-ink-muted">
                <Shield className="mr-1 inline h-3.5 w-3.5 text-ink-soft" />
                {t("entry.gateCode.hint")}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
