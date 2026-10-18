"use client";

import { useCallback } from "react";
import { useT } from "@/lib/i18n/context";
import { uploadRoomFile, type UploadProgress } from "@/lib/room-upload";

export function useRoomUpload(roomCode: string) {
  const t = useT();

  return useCallback(
    (file: File, onProgress?: UploadProgress) =>
      uploadRoomFile({ roomCode, file, t, onProgress }),
    [roomCode, t],
  );
}
