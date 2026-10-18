"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Check,
  CheckCheck,
  Clock3,
  LoaderCircle,
  X,
} from "lucide-react";
import { FileAction } from "@/components/chat/file-action";
import { MessageBubble } from "@/components/chat/message-bubble";
import { RoomComposer } from "@/components/chat/room-composer";
import { ImageViewerDialog } from "@/components/room/image-viewer-dialog";
import { MembersPanel } from "@/components/room/members-panel";
import { NoticeEditorDialog } from "@/components/room/notice-editor-dialog";
import { NoticeViewerDialog } from "@/components/room/notice-viewer-dialog";
import { RoomEntryDialog } from "@/components/room/room-entry-dialog";
import { RoomHeader } from "@/components/room/room-header";
import { RoomMenu } from "@/components/room/room-menu";
import { RoomQrDialog } from "@/components/room/room-qr-dialog";
import { RoomSettingsPopover } from "@/components/room/room-settings-popover";
import { RoomSidebar } from "@/components/room/room-sidebar";
import { useT } from "@/lib/i18n/context";
import {
  getCollapsedPreviewText,
  getMessageDeliveryState,
  isMessageCollapsed,
} from "@/lib/room-page";
import { useRoomAnnouncement } from "@/lib/use-room-announcement";
import { useRoomData } from "@/lib/use-room-data";
import { useRoomMembers } from "@/lib/use-room-members";
import { useRoomMembership } from "@/lib/use-room-membership";
import { useRoomMessages } from "@/lib/use-room-messages";
import { useRoomSettings } from "@/lib/use-room-settings";
import { useRoomUi } from "@/lib/use-room-ui";
import { useRoomUpload } from "@/lib/use-room-upload";
import { MAX_USER_ROOMS } from "@/lib/constants";
import type { AttachmentItem } from "@/types/chat";

export default function RoomPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const router = useRouter();
  const t = useT();

  const [action, setAction] = useState<string | null>(null);
  const [showNoticePopup, setShowNoticePopup] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const roomsPanelRef = useRef<HTMLElement | null>(null);
  const membersPanelRef = useRef<HTMLElement | null>(null);

  const handleShowAnnouncement = useCallback(() => {
    setShowNoticePopup(true);
  }, []);

  const data = useRoomData(roomCode, handleShowAnnouncement);
  const {
    boot,
    setBoot,
    snap,
    setSnap,
    loading,
    loadError,
    refresh,
    pollLatestMessages,
    latestMessageAtRef,
    retry,
  } = data;

  const isOwner = snap?.me.role === "OWNER";
  const upload = useRoomUpload(roomCode);
  const messages = useRoomMessages({
    roomCode,
    snap,
    setSnap,
    upload,
    pollLatestMessages,
    latestMessageAtRef,
  });
  const {
    text,
    files,
    enterToSend,
    composerFormRef,
    clampMessageText,
    setText,
    addFiles,
    removeFile,
    readClipboard,
    onPaste,
    onComposerKeyDown,
    send,
    toggleEnterToSend,
    pendingMessages,
    expandedMessageIds,
    expandedPendingMessageIds,
    copiedTextKeys,
    endRef,
    toggleMessageExpanded,
    togglePendingExpanded,
    copyMessageText,
  } = messages;
  const ui = useRoomUi(isOwner);
  const announcement = useRoomAnnouncement({
    roomCode,
    snap,
    setSnap,
    upload,
    refresh,
    setAction,
    setShowNoticePopup,
  });

  const rooms = useMemo(
    () => ({
      created: boot?.tree.createdRooms ?? [],
      joined: boot?.tree.joinedRooms ?? [],
    }),
    [boot],
  );
  const roomCount = rooms.created.length + rooms.joined.length;
  const canAddMoreRooms = roomCount < MAX_USER_ROOMS;
  const joinLink = useMemo(
    () =>
      typeof window === "undefined"
        ? ""
        : `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`,
    [roomCode],
  );

  const settings = useRoomSettings({
    roomCode,
    isOwner,
    snap,
    setSnap,
    setBoot,
    rooms,
    refresh,
    setAction,
    router,
  });
  const membership = useRoomMembership({
    roomCode,
    canAddMoreRooms,
    joinLink,
    setBoot,
    setAction,
    setOpenRoomMenu: ui.setOpenRoomMenu,
    router,
  });
  const members = useRoomMembers({ roomCode, refresh, setAction });

  const navVisible = !ui.navCollapsed;
  const membersVisible = !ui.membersCollapsed;

  useEffect(() => {
    if (!showQr || !joinLink) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale QR while regenerating
    setQr(null);
    const styles = getComputedStyle(document.documentElement);
    const dark = styles.getPropertyValue("--ds-qr-dark").trim();
    const light = styles.getPropertyValue("--ds-qr-light").trim();
    void QRCode.toDataURL(joinLink, {
      width: 280,
      margin: 1,
      color: { dark, light },
    }).then(setQr);
  }, [showQr, joinLink]);

  function scrollToPanel(target: "rooms" | "members") {
    const panel =
      target === "rooms" ? roomsPanelRef.current : membersPanelRef.current;
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-soft">
        <LoaderCircle className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (loadError && !snap) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm text-ink-soft" role="alert">
          {loadError}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft"
          >
            {t("common.retry")}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-line px-4 py-2 text-sm text-ink-soft"
          >
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  if (!snap) return null;

  if (snap.waitingApproval) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <section className="w-full max-w-lg rounded-2xl border border-line bg-panel/90 p-8 text-center">
          <Clock3 className="mx-auto h-8 w-8 text-ink-soft" />
          <h1 className="mt-4 text-xl font-semibold text-ink">
            等待房主审批
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            你曾被移出该房间，再次加入需要房主审批。
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-xl bg-elevated-strong px-4 py-2 text-sm text-ink"
          >
            返回首页
          </Link>
        </section>
      </main>
    );
  }

  const noticePopupContent = announcement.noticePreview ?? {
    text: snap.announcement.text,
    images: snap.announcement.images ?? [],
  };
  const isPreviewingNoticeDraft = Boolean(announcement.noticePreview);

  return (
    <>
      <main
        className={[
          "grid min-h-[100dvh] w-full grid-cols-1 gap-0 bg-canvas xl:h-[100dvh] xl:overflow-hidden",
          navVisible && membersVisible
            ? "xl:grid-cols-[290px_minmax(0,1fr)_290px]"
            : "",
          navVisible && !membersVisible
            ? "xl:grid-cols-[290px_minmax(0,1fr)]"
            : "",
          !navVisible && membersVisible
            ? "xl:grid-cols-[minmax(0,1fr)_290px]"
            : "",
          !navVisible && !membersVisible
            ? "xl:grid-cols-[minmax(0,1fr)]"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <RoomSidebar
          snap={snap}
          rooms={rooms}
          roomCode={roomCode}
          roomCount={roomCount}
          canAddMoreRooms={canAddMoreRooms}
          navVisible={navVisible}
          roomEntrySubmitting={membership.roomEntrySubmitting}
          createdCollapsed={ui.createdCollapsed}
          joinedCollapsed={ui.joinedCollapsed}
          roomsPanelRef={roomsPanelRef}
          toggleNavCollapsed={ui.toggleNavCollapsed}
          toggleCreatedCollapsed={ui.toggleCreatedCollapsed}
          toggleJoinedCollapsed={ui.toggleJoinedCollapsed}
          openRoomEntry={membership.openRoomEntry}
          onToggleMenu={ui.handleToggleRoomMenu}
        />

        <section className="order-1 flex min-h-[60vh] flex-col rounded-none border border-line-subtle bg-canvas xl:order-2 xl:h-full xl:min-h-0">
          <RoomHeader
            snap={snap}
            isOwner={isOwner}
            action={action}
            navVisible={navVisible}
            membersVisible={membersVisible}
            settingsOpen={ui.settingsOpen}
            toggleNavCollapsed={ui.toggleNavCollapsed}
            toggleMembersCollapsed={ui.toggleMembersCollapsed}
            setSettingsOpen={ui.setSettingsOpen}
            copyLink={membership.copyLink}
            setShowQr={setShowQr}
            openNoticeEditor={announcement.openNoticeEditor}
            openNoticeViewer={announcement.openNoticeViewer}
            dissolve={settings.dissolve}
            scrollToPanel={scrollToPanel}
          />

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            {snap.messages.length === 0 && pendingMessages.length === 0 ? (
              <div className="rounded-xl border border-line-subtle bg-panel/50 px-4 py-6 text-center text-sm text-ink-faint">
                {t("chat.empty")}
              </div>
            ) : null}

            {snap.messages.map((m) => {
              const isOwnMessage = m.sender.id === snap.me.id;
              const deliveryState = getMessageDeliveryState(snap, m);
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
                      <Check className="h-3.5 w-3.5 text-ink-soft" />
                    ) : isOwnMessage && deliveryState === "read" ? (
                      <CheckCheck className="h-3.5 w-3.5 text-ink-soft" />
                    ) : null
                  }
                  content={m.content}
                  collapsed={collapsed}
                  visibleContent={
                    collapsed
                      ? `${getCollapsedPreviewText(m.content)}...`
                      : m.content
                  }
                  onToggleExpand={() =>
                    toggleMessageExpanded(m.id, expanded)
                  }
                  onCopy={() => void copyMessageText(m.content, copyKey)}
                  copied={Boolean(copiedTextKeys[copyKey])}
                  labels={{
                    copy: t("chat.copy"),
                    copied: t("chat.copied"),
                    expand: t("chat.expand"),
                    collapse: t("chat.collapse"),
                  }}
                  attachments={m.attachments}
                  renderAttachmentAction={(a) => (
                    <FileAction
                      roomCode={roomCode}
                      attachment={a as AttachmentItem}
                      label={t("chat.download")}
                    />
                  )}
                  onOpenImage={ui.openImageViewer}
                />
              );
            })}

            {pendingMessages.map((message) => {
              const expanded = Boolean(
                expandedPendingMessageIds[message.localId],
              );
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
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin text-ink-soft" />
                        <span>{message.progress}%</span>
                      </>
                    ) : (
                      <>
                        <X className="h-3.5 w-3.5 text-danger" />
                        <span>{t("chat.sendFailed")}</span>
                      </>
                    )
                  }
                  content={message.content}
                  collapsed={collapsed}
                  visibleContent={
                    collapsed
                      ? `${getCollapsedPreviewText(message.content)}...`
                      : message.content
                  }
                  onToggleExpand={() =>
                    togglePendingExpanded(
                      message.localId,
                      expanded,
                    )
                  }
                  onCopy={() =>
                    void copyMessageText(message.content, copyKey)
                  }
                  copied={Boolean(copiedTextKeys[copyKey])}
                  labels={{
                    copy: t("chat.copy"),
                    copied: t("chat.copied"),
                    expand: t("chat.expand"),
                    collapse: t("chat.collapse"),
                  }}
                  attachments={message.attachments}
                  onOpenImage={ui.openImageViewer}
                  footerSlot={
                    message.status === "failed" && message.error ? (
                      <p className="mt-2 text-xs text-danger">{message.error}</p>
                    ) : null
                  }
                />
              );
            })}
            <div ref={endRef} />
          </div>

          <RoomComposer
            text={text}
            files={files}
            enterToSend={enterToSend}
            composerFormRef={composerFormRef}
            clampMessageText={clampMessageText}
            setText={setText}
            addFiles={addFiles}
            removeFile={removeFile}
            readClipboard={readClipboard}
            onPaste={onPaste}
            onComposerKeyDown={onComposerKeyDown}
            send={send}
            toggleEnterToSend={toggleEnterToSend}
          />
        </section>

        <MembersPanel
          snap={snap}
          isOwner={isOwner}
          action={action}
          membersVisible={membersVisible}
          memberPanelTab={ui.memberPanelTab}
          openMemberMenuId={ui.openMemberMenuId}
          membersPanelRef={membersPanelRef}
          memberMenuRef={ui.memberMenuRef}
          settingsPopover={
            isOwner ? (
              <RoomSettingsPopover
                open={ui.settingsOpen}
                onClose={() => ui.setSettingsOpen(false)}
                snap={snap}
                action={action}
                roomNameInput={settings.roomNameInput}
                gateCodeInput={settings.gateCodeInput}
                settingsErrors={settings.settingsErrors}
                setRoomNameInput={settings.setRoomNameInput}
                setGateCodeInput={settings.setGateCodeInput}
                setSettingsErrors={settings.setSettingsErrors}
                updateRoomName={settings.updateRoomName}
                updateGateCode={settings.updateGateCode}
                updateJoinPolicy={settings.updateJoinPolicy}
                updateNeverExpire={settings.updateNeverExpire}
              />
            ) : null
          }
          toggleMembersCollapsed={ui.toggleMembersCollapsed}
          setMemberPanelTab={ui.setMemberPanelTab}
          setOpenMemberMenuId={ui.setOpenMemberMenuId}
          kick={members.kick}
          transferOwner={members.transferOwner}
          review={members.review}
        />
      </main>

      <RoomMenu
        openRoomMenu={ui.openRoomMenu}
        floatingRoomMenuRef={ui.floatingRoomMenuRef}
        action={action}
        leaveRoom={membership.leaveRoom}
      />

      <RoomEntryDialog
        roomEntryMode={membership.roomEntryMode}
        roomEntrySubmitting={membership.roomEntrySubmitting}
        roomEntryErrors={membership.roomEntryErrors}
        roomCount={roomCount}
        canAddMoreRooms={canAddMoreRooms}
        createName={membership.createName}
        createGateCode={membership.createGateCode}
        joinRoomCode={membership.joinRoomCode}
        joinGateCode={membership.joinGateCode}
        joinInviteToken={membership.joinInviteToken}
        setRoomEntryMode={membership.setRoomEntryMode}
        setRoomEntryErrors={membership.setRoomEntryErrors}
        setCreateName={membership.setCreateName}
        setCreateGateCode={membership.setCreateGateCode}
        setJoinRoomCode={membership.setJoinRoomCode}
        setJoinGateCode={membership.setJoinGateCode}
        setJoinInviteToken={membership.setJoinInviteToken}
        quickCreateRoom={membership.quickCreateRoom}
        quickJoinRoom={membership.quickJoinRoom}
      />

      <RoomQrDialog
        open={showQr}
        qr={qr}
        joinLink={joinLink}
        onClose={() => setShowQr(false)}
      />

      <NoticeEditorDialog
        open={announcement.showNoticeEditor}
        action={action}
        noticeText={announcement.noticeText}
        noticeImages={announcement.noticeImages}
        setNoticeText={announcement.setNoticeText}
        addNoticeImages={announcement.addNoticeImages}
        removeNoticeImage={announcement.removeNoticeImage}
        openImageViewer={ui.openImageViewer}
        previewNoticeDraft={announcement.previewNoticeDraft}
        saveNotice={announcement.saveNotice}
        closeNoticeEditor={announcement.closeNoticeEditor}
      />

      <NoticeViewerDialog
        open={showNoticePopup}
        content={noticePopupContent}
        isPreviewingDraft={isPreviewingNoticeDraft}
        openImageViewer={ui.openImageViewer}
        onClose={announcement.closeNoticePopup}
      />

      <ImageViewerDialog
        imageViewer={ui.imageViewer}
        onClose={() => ui.setImageViewer(null)}
      />
    </>
  );
}
