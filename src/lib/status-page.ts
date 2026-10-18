import { ApiRequestError } from "@/lib/client";

export type RoomLoadFailureKind = "not-found" | "error";

/** Waiting-approval pages re-check the snapshot on this cadence. */
export const WAITING_APPROVAL_POLL_MS = 5_000;

/**
 * Distinguish a missing/dissolved room from a transport or server failure so
 * the room page can show the right full-page status instead of a raw message.
 */
export function classifyRoomLoadFailure(error: unknown): RoomLoadFailureKind {
  if (error instanceof ApiRequestError) {
    if (error.status === 404 || error.code === "ROOM_NOT_FOUND") {
      return "not-found";
    }
  }
  return "error";
}
