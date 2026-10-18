"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle, PlusCircle, Shield, Sparkles } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY, MAX_USER_ROOMS } from "@/lib/constants";
import { ApiRequestError, apiFetch } from "@/lib/client";
import { useT } from "@/lib/i18n/context";
import {
  GATE_CODE_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  normalizeGateCodeInput,
  normalizeRoomCodeInput,
  validateGateCode,
  validateRoomName,
  validateRoomCode,
} from "@/lib/home-form";
import type { BootstrapPayload } from "@/types/chat";
import { Avatar } from "@/components/chat/avatar";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Field, SegmentedControl, TextInput } from "@/components/ui/form-controls";

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

type JoinErrors = {
  roomCode?: string;
  gateCode?: string;
};

type CreateErrors = {
  name?: string;
  gateCode?: string;
};

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
  const t = useT();
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
  const [inviteFromLink, setInviteFromLink] = useState(false);
  const [joinErrors, setJoinErrors] = useState<JoinErrors>({});
  const [createErrors, setCreateErrors] = useState<CreateErrors>({});
  const [joinTouched, setJoinTouched] = useState<{ roomCode?: boolean; gateCode?: boolean }>({});
  const [createTouched, setCreateTouched] = useState<{ name?: boolean; gateCode?: boolean }>({});

  const joinRoomCodeRef = useRef<HTMLInputElement>(null);
  const joinGateCodeRef = useRef<HTMLInputElement>(null);
  const createNameRef = useRef<HTMLInputElement>(null);
  const createGateCodeRef = useRef<HTMLInputElement>(null);

  const [typedText, setTypedText] = useState("");
  const [typedIndex, setTypedIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const tRef = useRef(t);

  useEffect(() => {
    tRef.current = t;
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
          throw new Error("初始化失败，请刷新重试");
        }

        if (!bootPayload) return;

        const search = new URLSearchParams(window.location.search);
        const queryRoom = search.get("room");
        const queryInvite = search.get("invite");

        if (queryRoom) {
          setJoinRoomCode(normalizeRoomCodeInput(queryRoom));
          setJoinInviteToken(queryInvite ?? "");
          setInviteFromLink(Boolean(queryInvite));
          setTab("join");
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
        setError(fetchError instanceof Error ? fetchError.message : tRef.current("home.init.failed"));
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

  function roomCodeError(value: string) {
    const result = validateRoomCode(value);
    if (result === "required") return t("form.required");
    if (result === "format") return t("home.form.roomCode.invalid");
    return undefined;
  }

  function roomNameError(value: string) {
    const result = validateRoomName(value);
    if (result === "required") return t("form.required");
    if (result === "tooLong") return t("home.form.name.tooLong");
    return undefined;
  }

  function gateCodeError(value: string) {
    return validateGateCode(value) === "format" ? t("form.gateCode.invalid") : undefined;
  }

  function handleTabChange(next: TabType) {
    if (next === tab) return;
    setTab(next);
    setError(null);
    setInfo(null);
    setJoinErrors({});
    setCreateErrors({});
    setJoinTouched({});
    setCreateTouched({});
  }

  function handleJoinRoomCodeChange(value: string) {
    const next = normalizeRoomCodeInput(value);
    setJoinRoomCode(next);
    if (joinTouched.roomCode || joinErrors.roomCode) {
      setJoinErrors((prev) => ({ ...prev, roomCode: roomCodeError(next) }));
    }
  }

  function handleJoinGateCodeChange(value: string) {
    const next = normalizeGateCodeInput(value);
    setJoinGateCode(next);
    if (joinTouched.gateCode || joinErrors.gateCode) {
      setJoinErrors((prev) => ({ ...prev, gateCode: gateCodeError(next) }));
    }
  }

  function handleCreateNameChange(value: string) {
    setCreateName(value);
    if (createTouched.name || createErrors.name) {
      setCreateErrors((prev) => ({ ...prev, name: roomNameError(value) }));
    }
  }

  function handleCreateGateCodeChange(value: string) {
    const next = normalizeGateCodeInput(value);
    setCreateGateCode(next);
    if (createTouched.gateCode || createErrors.gateCode) {
      setCreateErrors((prev) => ({ ...prev, gateCode: gateCodeError(next) }));
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const nextErrors = {
      name: roomNameError(createName),
      gateCode: gateCodeError(createGateCode),
    };
    setCreateErrors(nextErrors);
    setCreateTouched({ name: true, gateCode: true });
    if (nextErrors.name) {
      createNameRef.current?.focus();
      return;
    }
    if (nextErrors.gateCode) {
      createGateCodeRef.current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const payload = await apiFetch<CreateResult>("/api/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          gateCode: createGateCode || undefined,
        }),
      });

      localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.room.roomCode);
      router.push(`/room/${payload.room.roomCode}`);
    } catch (createError) {
      if (createError instanceof ApiRequestError) {
        if (createError.code === "GATE_CODE_RECENTLY_USED") {
          setCreateErrors((prev) => ({
            ...prev,
            gateCode: t("home.form.gateCode.recentlyUsed"),
          }));
          createGateCodeRef.current?.focus();
          return;
        }
        if (createError.code === "ROOM_LIMIT_REACHED") {
          setError(t("home.roomLimitReached", { max: MAX_USER_ROOMS }));
          return;
        }
      }
      setError(createError instanceof Error ? createError.message : t("home.create.failed"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const nextErrors = {
      roomCode: roomCodeError(joinRoomCode),
      gateCode: gateCodeError(joinGateCode),
    };
    setJoinErrors(nextErrors);
    setJoinTouched({ roomCode: true, gateCode: true });
    if (nextErrors.roomCode) {
      joinRoomCodeRef.current?.focus();
      return;
    }
    if (nextErrors.gateCode) {
      joinGateCodeRef.current?.focus();
      return;
    }

    setSubmitting(true);

    try {
      const roomCode = normalizeRoomCodeInput(joinRoomCode);
      const payload = await apiFetch<JoinResult>(
        `/api/rooms/${encodeURIComponent(roomCode)}/join`,
        {
          method: "POST",
          body: JSON.stringify({
            gateCode: joinGateCode || undefined,
            inviteToken: joinInviteToken || undefined,
          }),
        },
      );

      if (payload.waitingApproval) {
        setInfo(t("home.join.waitingApproval"));
        return;
      }

      if (payload.joined && payload.roomCode) {
        localStorage.setItem(LAST_ROOM_STORAGE_KEY, payload.roomCode);
        router.push(`/room/${payload.roomCode}`);
      }
    } catch (joinError) {
      if (joinError instanceof ApiRequestError) {
        if (joinError.code === "GATE_CODE_INVALID") {
          setJoinErrors((prev) => ({
            ...prev,
            gateCode: t("home.form.gateCode.serverInvalid"),
          }));
          joinGateCodeRef.current?.focus();
          return;
        }
        if (joinError.code === "ROOM_NOT_FOUND") {
          setJoinErrors((prev) => ({
            ...prev,
            roomCode: t("home.form.roomCode.notFound"),
          }));
          joinRoomCodeRef.current?.focus();
          return;
        }
        if (joinError.code === "ROOM_LIMIT_REACHED") {
          setError(t("home.roomLimitReached", { max: MAX_USER_ROOMS }));
          return;
        }
      }
      setError(joinError instanceof Error ? joinError.message : t("home.join.failed"));
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

            <h2 className="text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
              临时信息传递空间
            </h2>

            <p className="max-w-md text-base leading-relaxed text-ink-muted sm:text-lg">
              房间 10 分钟无活跃自动销毁，信息短驻留、低负担。
            </p>

            <p className="min-h-[2rem] font-mono text-base text-ink-faint sm:text-lg">
              {typedText}
              <span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-ink-muted align-middle sm:h-5" />
            </p>
          </div>
        </div>

        <div className="flex min-h-0 items-center lg:min-h-[560px]">
          <section className="surface-card w-full p-6 sm:p-7" aria-labelledby="home-entry-title">
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-ink-faint">
                  {t("home.card.eyebrow")}
                </p>
                <h1
                  id="home-entry-title"
                  className="mt-2 text-2xl font-semibold tracking-tight text-ink"
                >
                  {t("home.card.title")}
                </h1>
                <p className="mt-1.5 text-sm text-ink-muted">{t("home.card.subtitle")}</p>
              </div>
              <div className="flex w-full flex-col items-end gap-2 sm:w-auto">
                <ThemeToggle />
                {displayMe ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-panel/80 px-3 py-2">
                    <Avatar
                      initial={displayMe.avatarInitial}
                      color={displayMe.avatarColor}
                      className="h-10 w-10 text-sm"
                    />
                    <div>
                      <p className="text-xs text-ink-faint">{t("home.identity.current")}</p>
                      <p className="text-sm font-medium text-ink">{displayMe.nickname}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <SegmentedControl
              id="home-tabs"
              panelId="home-form-panel"
              value={tab}
              onChange={handleTabChange}
              ariaLabel={t("home.tabs.label")}
              fullWidth
              className="mb-5 sm:w-auto"
              options={[
                {
                  value: "join",
                  label: t("home.tab.join"),
                  icon: <DoorOpen className="h-4 w-4" aria-hidden="true" />,
                  disabled: submitting,
                },
                {
                  value: "create",
                  label: t("home.tab.create"),
                  icon: <PlusCircle className="h-4 w-4" aria-hidden="true" />,
                  disabled: submitting,
                },
              ]}
            />

            <div
              key={tab}
              id="home-form-panel"
              role="tabpanel"
              aria-labelledby={`home-tabs-${tab}`}
              className="home-form-panel"
            >
              {tab === "join" ? (
                <form className="space-y-4" onSubmit={handleJoin} noValidate>
                  {inviteFromLink ? (
                    <p className="notice notice--success" role="status">
                      {t("home.invite.detected")}
                    </p>
                  ) : null}

                  <Field
                    id="home-join-room-code"
                    label={t("home.form.roomCode")}
                    hint={t("home.form.roomCode.hint")}
                    required
                    error={joinErrors.roomCode}
                  >
                    <TextInput
                      ref={joinRoomCodeRef}
                      name="roomCode"
                      value={joinRoomCode}
                      onChange={(event) => handleJoinRoomCodeChange(event.target.value)}
                      onBlur={() => {
                        setJoinTouched((prev) => ({ ...prev, roomCode: true }));
                        setJoinErrors((prev) => ({
                          ...prev,
                          roomCode: roomCodeError(joinRoomCode),
                        }));
                      }}
                      placeholder={t("home.form.roomCode.placeholder")}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      enterKeyHint="next"
                    />
                  </Field>

                  <Field
                    id="home-join-gate-code"
                    label={t("home.form.gateCode")}
                    hint={
                      <>
                        <span>{t("home.form.gateCode.hint")}</span>
                        <span className="type-numeric text-ink-faint">
                          {joinGateCode.length}/{GATE_CODE_LENGTH}
                        </span>
                      </>
                    }
                    hintClassName="form-hint--split"
                    error={joinErrors.gateCode}
                  >
                    <TextInput
                      ref={joinGateCodeRef}
                      name="gateCode"
                      value={joinGateCode}
                      onChange={(event) => handleJoinGateCodeChange(event.target.value)}
                      onBlur={() => {
                        setJoinTouched((prev) => ({ ...prev, gateCode: true }));
                        setJoinErrors((prev) => ({
                          ...prev,
                          gateCode: gateCodeError(joinGateCode),
                        }));
                      }}
                      placeholder={t("home.form.gateCode.placeholder")}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={GATE_CODE_LENGTH}
                      autoComplete="off"
                    />
                  </Field>

                  <Field
                    id="home-join-invite"
                    label={t("home.form.invite")}
                    hint={
                      inviteFromLink
                        ? t("home.form.invite.detected")
                        : t("home.form.invite.hint")
                    }
                  >
                    <TextInput
                      name="inviteToken"
                      value={joinInviteToken}
                      onChange={(event) => {
                        setJoinInviteToken(event.target.value.trim());
                        setInviteFromLink(false);
                      }}
                      placeholder={t("home.form.invite.placeholder")}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={submitting || loading}
                    aria-busy={submitting || undefined}
                    data-loading={submitting || undefined}
                    className="btn-primary btn-md w-full"
                  >
                    {submitting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <DoorOpen className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {submitting ? t("home.join.submitting") : t("home.join.submit")}
                    </span>
                  </button>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handleCreate} noValidate>
                  <Field
                    id="home-create-name"
                    label={t("home.form.name")}
                    hint={
                      <>
                        <span>{t("home.form.name.hint")}</span>
                        <span className="type-numeric text-ink-faint">
                          {createName.length}/{ROOM_NAME_MAX_LENGTH}
                        </span>
                      </>
                    }
                    hintClassName="form-hint--split"
                    required
                    error={createErrors.name}
                  >
                    <TextInput
                      ref={createNameRef}
                      name="name"
                      value={createName}
                      onChange={(event) => handleCreateNameChange(event.target.value)}
                      onBlur={() => {
                        setCreateTouched((prev) => ({ ...prev, name: true }));
                        setCreateErrors((prev) => ({
                          ...prev,
                          name: roomNameError(createName),
                        }));
                      }}
                      placeholder={t("home.form.name.placeholder")}
                      maxLength={ROOM_NAME_MAX_LENGTH}
                      autoComplete="off"
                      enterKeyHint="next"
                    />
                  </Field>

                  <Field
                    id="home-create-gate-code"
                    label={t("home.form.gateCode")}
                    hint={
                      <>
                        <span>{t("home.form.createGateHint")}</span>
                        <span className="type-numeric text-ink-faint">
                          {createGateCode.length}/{GATE_CODE_LENGTH}
                        </span>
                      </>
                    }
                    hintClassName="form-hint--split"
                    error={createErrors.gateCode}
                  >
                    <TextInput
                      ref={createGateCodeRef}
                      name="gateCode"
                      value={createGateCode}
                      onChange={(event) => handleCreateGateCodeChange(event.target.value)}
                      onBlur={() => {
                        setCreateTouched((prev) => ({ ...prev, gateCode: true }));
                        setCreateErrors((prev) => ({
                          ...prev,
                          gateCode: gateCodeError(createGateCode),
                        }));
                      }}
                      placeholder={t("home.form.gateCode.placeholder")}
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      maxLength={GATE_CODE_LENGTH}
                      autoComplete="off"
                    />
                  </Field>

                  <button
                    type="submit"
                    disabled={submitting || loading}
                    aria-busy={submitting || undefined}
                    data-loading={submitting || undefined}
                    className="btn-primary btn-md w-full"
                  >
                    {submitting ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {submitting ? t("home.create.submitting") : t("home.create.submit")}
                    </span>
                  </button>
                </form>
              )}
            </div>

            <div className="mt-5 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-panel/70 px-3 py-2 text-ink-muted">
                <span className="type-numeric">
                  {t("home.roomCount", { count: roomCount, max: MAX_USER_ROOMS })}
                </span>
              </div>
              <div className="rounded-xl bg-panel/70 px-3 py-2 text-ink-muted">
                <Shield className="mr-1 inline h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
                <span>{t("home.gateRule")}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2" aria-live="polite">
              {info ? (
                <p className="notice notice--success" role="status">
                  {info}
                </p>
              ) : null}
              {error ? (
                <p className="notice notice--danger" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
