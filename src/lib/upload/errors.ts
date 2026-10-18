import { ApiError } from "@/lib/api";
import { UploadPlanError } from "@/lib/upload/plan";
import { RemoteUploadError } from "@/lib/upload/remote/http";
import { UploadSessionError } from "@/lib/upload/session";

export function normalizeUploadError(error: unknown): unknown {
  if (error instanceof UploadSessionError) {
    return new ApiError(error.status, error.message, error.code);
  }

  if (error instanceof RemoteUploadError) {
    return new ApiError(error.status, error.message, error.code);
  }

  if (error instanceof UploadPlanError) {
    const status = error.code === "UPLOAD_FILE_TOO_LARGE" ? 413 : 400;
    return new ApiError(status, error.message, error.code);
  }

  return error;
}
