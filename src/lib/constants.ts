export const APP_NAME = "临时笨迪";
export const APP_OPEN_SOURCE = "MIT";

export const APP_VERSION_PARTS = {
  major: 0,
  minor: 1,
  patch: 45,
} as const;

export const APP_VERSION = `${APP_VERSION_PARTS.major}.${APP_VERSION_PARTS.minor}.${APP_VERSION_PARTS.patch}`;

export const MAX_USER_ROOMS = 10;
export const MAX_ROOM_MEMBERS = 20;
export const GATE_CODE_RECYCLE_WINDOW_MS = 60_000;
export const ROOM_IDLE_DESTROY_MS = 10 * 60_000;
export const ONLINE_WINDOW_MS = 2 * 60_000;
export const INVITE_TTL_MS = 15 * 60_000;

export const USER_COOKIE_NAME = "tb_uid";
export const LAST_ROOM_STORAGE_KEY = "tb:last-room";

export const MESSAGE_PAGE_SIZE = 120;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024 * 1024;
export const MAX_ANNOUNCEMENT_IMAGE_BYTES = 200 * 1024 * 1024;
export const MAX_PROXY_UPLOAD_BYTES = 200 * 1024 * 1024;

const DEFAULT_MAX_MESSAGE_TEXT_CHARS = 200_000;
const parsedMaxMessageTextChars = Number.parseInt(
  process.env.NEXT_PUBLIC_MAX_MESSAGE_TEXT_CHARS ?? "",
  10,
);

export const MAX_MESSAGE_TEXT_CHARS =
  Number.isFinite(parsedMaxMessageTextChars) && parsedMaxMessageTextChars > 0
    ? Math.min(parsedMaxMessageTextChars, 1_000_000)
    : DEFAULT_MAX_MESSAGE_TEXT_CHARS;

const DEFAULT_MAX_ANNOUNCEMENT_IMAGES = 3;
const announcementImageLimit = Number.parseInt(
  process.env.NEXT_PUBLIC_MAX_ANNOUNCEMENT_IMAGES ?? "",
  10,
);

export const MAX_ANNOUNCEMENT_IMAGES =
  Number.isFinite(announcementImageLimit) && announcementImageLimit > 0
    ? Math.min(announcementImageLimit, 9)
    : DEFAULT_MAX_ANNOUNCEMENT_IMAGES;

