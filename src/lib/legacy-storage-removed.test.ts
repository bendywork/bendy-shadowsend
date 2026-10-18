import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoot = join(root, "src");

const LEGACY_PATTERNS = [
  /@\/lib\/s3\b/,
  /@\/lib\/dufs\b/,
  /@\/lib\/storage-policy\b/,
  /env\.s3\b/,
  /env\.dufs\b/,
  /env\.ossPreview\b/,
  /\bS3_(REGION|ENDPOINT|BUCKET|ACCESS_KEY_ID|SECRET_ACCESS_KEY|FORCE_PATH_STYLE)\b/,
  /\bDUFS_(BASE_URL|PUBLIC_BASE_URL|PATH_PREFIX|AUTH)\b/,
  /\bOSS_PREVIEW_(RPC_URL|BUCKET_NAME|COOKIE)\b/,
  /\bAttachmentStorage\.(S3|DUFS)\b/,
  /\bfetchDufsFile\b/,
  /\bcreateDufsPublicUrl\b/,
  /\bisS3Configured\b/,
];

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(fullPath);
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

describe("legacy storage decommission", () => {
  it("has no S3/DUFS/OSS references in production source", () => {
    const offenders = listSourceFiles(sourceRoot).flatMap((file) => {
      const content = readFileSync(file, "utf8");
      return LEGACY_PATTERNS.filter((pattern) => pattern.test(content)).map(
        (pattern) => `${relative(root, file)} matched ${pattern}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it("removes legacy storage variables from .env.example", () => {
    const content = readFileSync(join(root, ".env.example"), "utf8");

    expect(content).not.toMatch(/\bS3_/);
    expect(content).not.toMatch(/\bDUFS_/);
    expect(content).not.toMatch(/\bOSS_PREVIEW_/);
  });

  it("removes the legacy AWS SDK dependencies", () => {
    const packageJson = readFileSync(join(root, "package.json"), "utf8");

    expect(packageJson).not.toContain("@aws-sdk/client-s3");
    expect(packageJson).not.toContain("@aws-sdk/s3-request-presigner");
  });

  it("removes the legacy upload endpoints", () => {
    const uploadDir = join(root, "src/app/api/rooms/[roomCode]/upload");

    expect(() => readdirSync(join(uploadDir, "chunk"))).toThrow();
    expect(() =>
      readdirSync(join(root, "src/app/api/rooms/[roomCode]/upload-url")),
    ).toThrow();
  });
});
