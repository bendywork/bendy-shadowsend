"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, LoaderCircle, PlusCircle, Shield, Sparkles } from "lucide-react";
import { LAST_ROOM_STORAGE_KEY, MAX_USER_ROOMS } from "@/lib/constants";
import { apiFetch } from "@/lib/client";
import {
  GATE_CODE_LENGTH,
  ROOM_CODE_MAX_LENGTH,
  ROOM_CODE_MIN_LENGTH,
  ROOM_NAME_MAX_LENGTH,
  validateGateCode,
  validateRoomCode,
  validateRoomName,
} from "@/lib/form-validation";
import type { BootstrapPayload } from "@/types/chat";
import type { MessageKey } from "@/lib/i18n/messages";
import { useT } from "@/lib/i18n/context";
import { Avatar } from "@/components/chat/avatar";
import { Field, SegmentedControl, TextInput } from "@/components/ui/form-controls";
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

type JoinFieldErrors = {
  roomCode?: MessageKey;
  gateCode?: MessageKey;
};

type CreateFieldErrors = {
  name?: MessageKey;
  gateCode?: MessageKey;
};

export default function HomePage() {
  const router = useRouter();
  const t = useT();
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

  const [joinErrors, setJoinErrors] = useState<JoinFieldErrors>({});
  const [createErrors, setCreateErrors] = useState<CreateFieldErrors>({});

  const joinRoomRef = useRef<HTMLInputElement>(null);
  const joinGateRef = useRef<HTMLInputElement>(null);
  const createNameRef = useRef<HTMLInputElement>(null);
  const createGateRef = useRef<HTMLInputElement>(null);

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

  const roomCount = useMemo(() => {
    if (!bootstrap) return 0;
    return bootstrap.tree.createdRooms.length + bootstrap.tree.joinedRooms.length;
  }, [bootstrap]);

  const displayMe = bootstrap?.me ?? fallbackMe;

  /**
   * Validation keys carry their own parameters so switching language keeps
   * the inline copy in sync with the active locale.
   */
  function fieldErrorText(key: MessageKey | undefined): string | undefined {
    if (!key) return undefined;
    if (key === "form.roomNameTooLong") return t(key, { max: ROOM_NAME_MAX_LENGTH });
    if (key === "form.roomCodeTooShort") return t(key, { min: ROOM_CODE_MIN_LENGTH });
    if (key === "form.roomCodeTooLong") return t(key, { max: ROOM_CODE_MAX_LENGTH });
    return t(key);
  }

  function clearStatus() {
    setErrorText(null);
    setErrorKey(null);
    setInfoKey(null);
  }

  function switchTab(next: TabType) {
    setTab(next);
    clearStatus();
  }

  function validateJoinFields(): boolean {
    const roomCodeError = validateRoomCode(joinRoomCode);
    const gateCodeError = validateGateCode(joinGateCode);

    setJoinErrors({
      ...(roomCodeError ? { roomCode: roomCodeError } : {}),
      ...(gateCodeError ? { gateCode: gateCodeError } : {}),
    });

    if (roomCodeError) {
      joinRoomRef.current?.focus();
      return false;
    }
    if (gateCodeError) {
      joinGateRef.current?.focus();
      return false;
    }
    return true;
  }

  function validateCreateFields(): boolean {
    const nameError = validateRoomName(createName);
    const gateCodeError = validateGateCode(createGateCode);

    setCreateErrors({
      ...(nameError ? { name: nameError } : {}),
      ...(gateCodeError ? { gateCode: gateCodeError } : {}),
    });

    if (nameError) {
      createNameRef.current?.focus();
      return false;
    }
    if (gateCodeError) {
      createGateRef.current?.focus();
      return false;
    }
    return true;
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStatus();
    if (!validateCreateFields()) return;
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
      const message = createError instanceof Error ? createError.message : "";
      if (message) setErrorText(message);
      else setErrorKey("home.error.create");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStatus();
    if (!validateJoinFields()) return;
    setSubmitting(true);

    try {
      const payload = await apiFetch<JoinResult>(`/api/rooms/${joinRoomCode.trim()}/join`, {
        method: "POST",
        body: JSON.stringify({
          gateCode: joinGateCode || undefined,
          inviteToken: joinInviteToken.trim() || undefined,
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

        <section className="surface-card home-entry" aria-labelledby="home-entry-title">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="home-entry__kicker">{t("home.entry.kicker")}</p>
              <h2 id="home-entry-title" className="mt-2 text-2xl font-semibold tracking-tight text-ink">
                {t("home.entry.title")}
              </h2>
              <p className="mt-1.5 text-sm text-ink-muted">{t("home.entry.subtitle")}</p>
            </div>
            {displayMe ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line-subtle bg-panel/80 px-3 py-2">
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

          <SegmentedControl
            value={tab}
            onChange={switchTab}
            ariaLabel={t("home.tabs.label")}
            fullWidth
            className="mb-5"
            options={[
              {
                value: "join",
                label: t("home.tab.join"),
                icon: <DoorOpen className="h-4 w-4" aria-hidden="true" />,
              },
              {
                value: "create",
                label: t("home.tab.create"),
                icon: <PlusCircle className="h-4 w-4" aria-hidden="true" />,
              },
            ]}
          />

          {tab === "join" ? (
            <form
              className="space-y-4"
              onSubmit={handleJoin}
              noValidate
              aria-label={t("home.join.formLabel")}
              aria-busy={submitting}
            >
              <Field
                id="home-join-room-code"
                label={t("home.join.roomCode.label")}
                hint={t("home.join.roomCode.hint", {
                  min: ROOM_CODE_MIN_LENGTH,
                  max: ROOM_CODE_MAX_LENGTH,
                })}
                error={fieldErrorText(joinErrors.roomCode)}
                required
              >
                <TextInput
                  ref={joinRoomRef}
                  value={joinRoomCode}
                  onChange={(event) => {
                    setJoinRoomCode(event.target.value.trim());
                    if (joinErrors.roomCode) {
                      setJoinErrors((prev) => ({ ...prev, roomCode: undefined }));
                    }
                  }}
                  placeholder={t("home.join.roomCode.placeholder")}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={ROOM_CODE_MAX_LENGTH}
                  required
                />
              </Field>

              <Field
                id="home-join-gate-code"
                label={t("home.join.gateCode.label")}
                hint={
                  <span className="flex items-center gap-2">
                    <span>{t("home.join.gateCode.hint", { length: GATE_CODE_LENGTH })}</span>
                    <span className="form-counter">
                      {joinGateCode.length}/{GATE_CODE_LENGTH}
                    </span>
                  </span>
                }
                error={fieldErrorText(joinErrors.gateCode)}
              >
                <TextInput
                  ref={joinGateRef}
                  value={joinGateCode}
                  onChange={(event) => {
                    setJoinGateCode(event.target.value.replace(/\D/g, "").slice(0, GATE_CODE_LENGTH));
                    if (joinErrors.gateCode) {
                      setJoinErrors((prev) => ({ ...prev, gateCode: undefined }));
                    }
                  }}
                  placeholder={t("home.join.gateCode.placeholder")}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={GATE_CODE_LENGTH}
                />
              </Field>

              <Field
                id="home-join-invite"
                label={t("home.join.invite.label")}
                hint={t("home.join.invite.hint")}
              >
                <TextInput
                  value={joinInviteToken}
                  onChange={(event) => setJoinInviteToken(event.target.value.trim())}
                  placeholder={t("home.join.invite.placeholder")}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>

              <button
                type="submit"
                disabled={submitting || loading}
                className="btn-primary btn-md w-full"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <DoorOpen className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? t("home.join.submitting") : t("home.join.submit")}
              </button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={handleCreate}
              noValidate
              aria-label={t("home.create.formLabel")}
              aria-busy={submitting}
            >
              <Field
                id="home-create-name"
                label={t("home.create.name.label")}
                hint={
                  <span className="flex items-center gap-2">
                    <span>{t("home.create.name.hint", { max: ROOM_NAME_MAX_LENGTH })}</span>
                    <span className="form-counter">
                      {createName.length}/{ROOM_NAME_MAX_LENGTH}
                    </span>
                  </span>
                }
                error={fieldErrorText(createErrors.name)}
                required
              >
                <TextInput
                  ref={createNameRef}
                  value={createName}
                  onChange={(event) => {
                    setCreateName(event.target.value);
                    if (createErrors.name) {
                      setCreateErrors((prev) => ({ ...prev, name: undefined }));
                    }
                  }}
                  placeholder={t("home.create.name.placeholder")}
                  autoComplete="off"
                  maxLength={ROOM_NAME_MAX_LENGTH}
                  required
                />
              </Field>

              <Field
                id="home-create-gate-code"
                label={t("home.create.gateCode.label")}
                hint={
                  <span className="flex items-center gap-2">
                    <span>{t("home.create.gateCode.hint", { length: GATE_CODE_LENGTH })}</span>
                    <span className="form-counter">
                      {createGateCode.length}/{GATE_CODE_LENGTH}
                    </span>
                  </span>
                }
                error={fieldErrorText(createErrors.gateCode)}
              >
                <TextInput
                  ref={createGateRef}
                  value={createGateCode}
                  onChange={(event) => {
                    setCreateGateCode(event.target.value.replace(/\D/g, "").slice(0, GATE_CODE_LENGTH));
                    if (createErrors.gateCode) {
                      setCreateErrors((prev) => ({ ...prev, gateCode: undefined }));
                    }
                  }}
                  placeholder={t("home.create.gateCode.placeholder")}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={GATE_CODE_LENGTH}
                />
              </Field>

              <button
                type="submit"
                disabled={submitting || loading}
                className="btn-primary btn-md w-full"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {submitting ? t("home.create.submitting") : t("home.create.submit")}
              </button>
            </form>
          )}

          <div className="mt-5 space-y-2 text-xs">
            <div className="rounded-xl border border-line-subtle bg-panel/70 px-3 py-2 text-ink-muted">
              {t("home.stats.rooms")}
              <span className="ml-1 font-semibold text-ink-soft">
                {roomCount}/{MAX_USER_ROOMS}
              </span>
            </div>
            <div className="rounded-xl border border-line-subtle bg-panel/70 px-3 py-2 text-ink-muted">
              <Shield className="mr-1 inline h-3.5 w-3.5 text-ink-soft" aria-hidden="true" />
              {t("home.stats.gateHint", { length: GATE_CODE_LENGTH })}
            </div>
          </div>

          {infoKey ? (
            <p
              className="mt-4 rounded-lg border border-line-subtle bg-panel/50 px-3 py-2 text-sm text-ink-soft"
              role="status"
              aria-live="polite"
            >
              {t(infoKey)}
            </p>
          ) : null}
          {errorText || errorKey ? (
            <p
              className="mt-4 rounded-lg border border-danger-border bg-danger-soft px-3 py-2 text-sm text-danger"
              role="alert"
            >
              {errorText ?? (errorKey ? t(errorKey) : null)}
            </p>
          ) : null}
        </section>
      </section>
    </main>
  );
}
