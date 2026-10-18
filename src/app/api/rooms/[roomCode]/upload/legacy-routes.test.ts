import { describe, expect, it, vi } from "vitest";
import { DELETE as deleteChunk, POST as postChunk } from "@/app/api/rooms/[roomCode]/upload/chunk/route";
import { POST as postUploadUrl } from "@/app/api/rooms/[roomCode]/upload-url/route";
import { LEGACY_STORAGE_UPLOAD_DISABLED_CODE } from "@/lib/storage-policy";

async function expectLegacyUploadDisabled(response: Response) {
  expect(response.status).toBe(410);

  const body = (await response.json()) as {
    ok: boolean;
    error?: { code?: string };
  };

  expect(body.ok).toBe(false);
  expect(body.error?.code).toBe(LEGACY_STORAGE_UPLOAD_DISABLED_CODE);
}

describe("legacy storage upload endpoints", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);

  it("rejects S3 presigned upload preparation with 410", async () => {
    await expectLegacyUploadDisabled(await postUploadUrl());
  });

  it("rejects DUFS chunk uploads with 410", async () => {
    await expectLegacyUploadDisabled(await postChunk());
  });

  it("rejects DUFS chunk cleanup with 410", async () => {
    await expectLegacyUploadDisabled(await deleteChunk());
  });
});
