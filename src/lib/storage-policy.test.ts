import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import {
  LEGACY_STORAGE_READ_ENABLED,
  LEGACY_STORAGE_UPLOAD_DISABLED_CODE,
  LEGACY_STORAGE_UPLOAD_DISABLED_MESSAGE,
  LEGACY_STORAGE_UPLOAD_ENABLED,
  createLegacyStorageUploadDisabledError,
  isLegacyStorageReadEnabled,
  isLegacyStorageUploadEnabled,
  throwLegacyStorageUploadDisabled,
} from "@/lib/storage-policy";

describe("legacy storage policy (dc-05 = A)", () => {
  it("disables every legacy storage upload path", () => {
    expect(LEGACY_STORAGE_UPLOAD_ENABLED).toBe(false);
    expect(isLegacyStorageUploadEnabled()).toBe(false);
  });

  it("keeps legacy storage reads enabled for existing attachments", () => {
    expect(LEGACY_STORAGE_READ_ENABLED).toBe(true);
    expect(isLegacyStorageReadEnabled()).toBe(true);
  });

  it("builds a 410 error with a stable code and message", () => {
    const error = createLegacyStorageUploadDisabledError();

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(410);
    expect(error.code).toBe(LEGACY_STORAGE_UPLOAD_DISABLED_CODE);
    expect(error.message).toBe(LEGACY_STORAGE_UPLOAD_DISABLED_MESSAGE);
  });

  it("throws the disabled error from the write guard", () => {
    expect(() => throwLegacyStorageUploadDisabled()).toThrowError(ApiError);

    try {
      throwLegacyStorageUploadDisabled();
    } catch (error) {
      expect((error as ApiError).status).toBe(410);
      expect((error as ApiError).code).toBe(
        LEGACY_STORAGE_UPLOAD_DISABLED_CODE,
      );
    }
  });
});
