import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("retired storage configuration", () => {
  it("has no old provider implementation, imports or environment reads in production code", () => {
    const forbidden = /@aws-sdk\/|@\/lib\/(?:s3|dufs)|\b(?:S3|DUFS|OSS_PREVIEW|CONFIG_CENTER)_[A-Z_]+|env\.(?:s3|dufs|ossPreview)|AttachmentStorage\.(?:S3|DUFS)/;
    for (const file of productionFiles("src")) expect(readFileSync(file, "utf8"), file).not.toMatch(forbidden);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    expect(Object.keys(pkg.dependencies).some((name) => name.startsWith("@aws-sdk/"))).toBe(false);
    expect(Object.keys(lock.packages).some((name) => name.startsWith("node_modules/@aws-sdk/"))).toBe(false);
  });

  it("requires only a database connection in the configuration template", () => {
    const keys = readFileSync(".env.example", "utf8").split("\n").filter((line) => /^[A-Z_]+=/.test(line)).map((line) => line.split("=")[0]);
    expect(keys).toEqual(["DATABASE_URL"]);
  });

  it("ignores malformed obsolete environment values when starting", async () => {
    vi.stubEnv("S3_ENDPOINT", "not-a-url");
    vi.stubEnv("DUFS_BASE_URL", "not-a-url");
    vi.stubEnv("OSS_PREVIEW_RPC_URL", "not-a-url");
    vi.resetModules();
    const { env } = await import("@/lib/env");
    expect(Object.keys(env).sort()).toEqual(["appAuth", "appVersion"]);
  });
});
