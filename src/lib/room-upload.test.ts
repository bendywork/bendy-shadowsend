import { describe, expect, it } from "vitest";
import {
  CHUNKED_UPLOAD_THRESHOLD_BYTES,
  MAX_PROXY_UPLOAD_BYTES,
} from "@/lib/constants";
import { resolveFallbackUploadStrategy } from "@/lib/room-upload";

describe("resolveFallbackUploadStrategy", () => {
  it("rejects files beyond the proxy limit", () => {
    expect(
      resolveFallbackUploadStrategy({
        size: MAX_PROXY_UPLOAD_BYTES + 1,
        type: "image/png",
      }),
    ).toBe("too-large");
  });

  it("uses chunked proxy for large images below the limit", () => {
    expect(
      resolveFallbackUploadStrategy({
        size: CHUNKED_UPLOAD_THRESHOLD_BYTES,
        type: "image/png",
      }),
    ).toBe("chunked-proxy");
  });

  it("uses the plain proxy for small images and non-images", () => {
    expect(
      resolveFallbackUploadStrategy({
        size: CHUNKED_UPLOAD_THRESHOLD_BYTES - 1,
        type: "image/png",
      }),
    ).toBe("proxy");
    expect(
      resolveFallbackUploadStrategy({
        size: CHUNKED_UPLOAD_THRESHOLD_BYTES,
        type: "video/mp4",
      }),
    ).toBe("proxy");
  });
});
