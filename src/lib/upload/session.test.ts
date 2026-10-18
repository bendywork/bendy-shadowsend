import { describe, expect, it } from "vitest";

import { UPLOAD_SESSION_TTL_MS } from "@/lib/upload/constants";
import {
  createUploadSession,
  signUploadSession,
  UploadSessionError,
  verifyUploadSession,
} from "@/lib/upload/session";

const secret = "test-session-secret-0123456789";

function buildSession(now = Date.now()) {
  return createUploadSession({
    roomId: "room-1",
    userId: "user-1",
    service: "pic-sl",
    fileName: "archive.zip",
    mimeType: "application/zip",
    sizeBytes: 8 * 1024 * 1024 + 12,
    now,
  });
}

describe("upload session tokens", () => {
  it("round-trips a signed session", () => {
    const payload = buildSession();
    const token = signUploadSession(payload, secret);
    const verified = verifyUploadSession(token, secret);

    expect(verified.sid).toBe(payload.sid);
    expect(verified.roomId).toBe("room-1");
    expect(verified.userId).toBe("user-1");
    expect(verified.totalChunks).toBe(3);
    expect(verified.storage).toBe("PIC_SL");
  });

  it("rejects a tampered payload", () => {
    const token = signUploadSession(buildSession(), secret);
    const [body, signature] = token.split(".");
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    decoded.totalBytes = 1;
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;

    expect(() => verifyUploadSession(tampered, secret)).toThrowError(UploadSessionError);
  });

  it("rejects a wrong secret", () => {
    const token = signUploadSession(buildSession(), secret);
    expect(() => verifyUploadSession(token, "another-secret-0123456789")).toThrowError(
      /签名无效/,
    );
  });

  it("rejects expired sessions", () => {
    const payload = buildSession(Date.now() - UPLOAD_SESSION_TTL_MS - 1_000);
    const token = signUploadSession(payload, secret);
    expect(() => verifyUploadSession(token, secret)).toThrowError(/已过期/);
  });

  it("rejects malformed tokens", () => {
    expect(() => verifyUploadSession("not-a-token", secret)).toThrowError(/格式无效/);
    expect(() => verifyUploadSession("a.b.c", secret)).toThrowError(/格式无效/);
  });

  it("refuses to sign without a secret", () => {
    expect(() => signUploadSession(buildSession(), "")).toThrowError(/密钥未配置/);
  });
});
