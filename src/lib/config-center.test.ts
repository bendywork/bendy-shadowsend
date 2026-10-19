import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConfigCenterError,
  ensureConfigLoaded,
  fetchConfigCenterSnapshot,
  getConfigEntry,
  getConfigStatus,
  getConfigValue,
  parseConfigContent,
  resetConfigCenterForTests,
  resolveConfigCenterConfig,
  type ConfigLogger,
} from "@/lib/config-center";

const BASE = {
  url: "https://config.example.com",
  appKey: "ak_test",
  appSecret: "as_test",
  project: "bendy-shadowsend",
  environment: "test",
  group: "app-config",
} as const;

function createLogger(): ConfigLogger {
  return { info: vi.fn(), warn: vi.fn() };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okBody(content: string, format = "json", version: number | null = 3) {
  return {
    success: true,
    data: {
      project: BASE.project,
      environment: BASE.environment,
      group: BASE.group,
      format,
      content,
      version,
      updated_at: "2026-10-19T00:00:00.000Z",
    },
  };
}

function asFetch(fn: (...args: never[]) => unknown): typeof fetch {
  return fn as unknown as typeof fetch;
}

let nowMs = 1_000_000;
const now = () => nowMs;

beforeEach(() => {
  nowMs = 1_000_000;
  resetConfigCenterForTests();
});

afterEach(() => {
  vi.useRealTimers();
  resetConfigCenterForTests();
});

describe("parseConfigContent", () => {
  it("flattens nested JSON into dot-notation keys", () => {
    const values = parseConfigContent(
      JSON.stringify({
        APP_AUTH: "secret",
        S3: { BUCKET: "bucket", ENDPOINT: "https://s3.example.com" },
        FLAGS: ["a", "b"],
        EMPTY: null,
      }),
      "json",
    );

    expect(values.get("APP_AUTH")).toBe("secret");
    expect(values.get("S3.BUCKET")).toBe("bucket");
    expect(values.get("S3.ENDPOINT")).toBe("https://s3.example.com");
    expect(values.get("FLAGS")).toBe('["a","b"]');
    expect(values.get("EMPTY")).toBe("");
  });

  it("parses properties files and ignores comments", () => {
    const values = parseConfigContent(
      ["# comment", "APP_AUTH=from-properties", "S3_BUCKET = bucket", "EMPTY="].join("\n"),
      "properties",
    );

    expect(values.get("APP_AUTH")).toBe("from-properties");
    expect(values.get("S3_BUCKET")).toBe("bucket");
    expect(values.get("EMPTY")).toBe("");
  });

  it("parses ini sections into dotted keys", () => {
    const values = parseConfigContent(
      ["[s3]", "BUCKET=bucket", "[dufs]", 'AUTH="user:pass"'].join("\n"),
      "ini",
    );

    expect(values.get("s3.BUCKET")).toBe("bucket");
    expect(values.get("dufs.AUTH")).toBe("user:pass");
  });

  it("parses text as KEY=VALUE lines", () => {
    const values = parseConfigContent("APP_AUTH=from-text\nDUFS_PATH_PREFIX=/files\n", "text");
    expect(values.get("APP_AUTH")).toBe("from-text");
    expect(values.get("DUFS_PATH_PREFIX")).toBe("/files");
  });

  it("rejects invalid JSON with a typed error", () => {
    expect(() => parseConfigContent("{not json", "json")).toThrowError(
      expect.objectContaining({ code: "CONFIG_JSON_INVALID" }),
    );
  });

  it("rejects unsupported formats instead of guessing", () => {
    expect(() => parseConfigContent("a: b", "yaml")).toThrowError(
      expect.objectContaining({ code: "CONFIG_FORMAT_UNSUPPORTED" }),
    );
  });
});

describe("resolveConfigCenterConfig", () => {
  it("is disabled when bootstrap credentials are missing", () => {
    const config = resolveConfigCenterConfig({ env: {} });
    expect(config.enabled).toBe(false);
    expect(config.project).toBe("bendy-shadowsend");
    expect(config.group).toBe("app-config");
    expect(config.timeoutMs).toBe(2_500);
    expect(config.ttlMs).toBe(300_000);
    expect(config.retryMs).toBe(30_000);
  });

  it("maps VERCEL_ENV to config center environments", () => {
    expect(
      resolveConfigCenterConfig({ env: { VERCEL_ENV: "production" } }).environment,
    ).toBe("prod");
    expect(resolveConfigCenterConfig({ env: { VERCEL_ENV: "preview" } }).environment).toBe("pre");
    expect(
      resolveConfigCenterConfig({ env: { VERCEL_ENV: "development" } }).environment,
    ).toBe("dev");
    expect(resolveConfigCenterConfig({ env: {} }).environment).toBe("dev");
  });

  it("clamps timeout, TTL and retry values into safe ranges", () => {
    const tooSmall = resolveConfigCenterConfig({
      env: {
        CONFIG_CENTER_TIMEOUT_MS: "10",
        CONFIG_CENTER_TTL_MS: "10",
        CONFIG_CENTER_RETRY_MS: "10",
      },
    });
    expect(tooSmall.timeoutMs).toBe(500);
    expect(tooSmall.ttlMs).toBe(5_000);
    expect(tooSmall.retryMs).toBe(1_000);

    const tooLarge = resolveConfigCenterConfig({
      env: {
        CONFIG_CENTER_TIMEOUT_MS: "999999",
        CONFIG_CENTER_TTL_MS: "999999999",
        CONFIG_CENTER_RETRY_MS: "999999999",
      },
    });
    expect(tooLarge.timeoutMs).toBe(10_000);
    expect(tooLarge.ttlMs).toBe(3_600_000);
    expect(tooLarge.retryMs).toBe(300_000);
  });

  it("honors the CONFIG_CENTER_ENABLED=false kill switch", () => {
    const config = resolveConfigCenterConfig({
      env: {
        CONFIG_CENTER_ENABLED: "false",
        CONFIG_CENTER_URL: BASE.url,
        CONFIG_CENTER_APP_KEY: BASE.appKey,
        CONFIG_CENTER_APP_SECRET: BASE.appSecret,
      },
    });
    expect(config.enabled).toBe(false);
  });
});

describe("fetchConfigCenterSnapshot", () => {
  it("calls the config center client API and parses the content", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth", S3_BUCKET: "bucket" }))),
    );

    const snapshot = await fetchConfigCenterSnapshot({
      ...BASE,
      env: {},
      now,
      logger,
      fetchImpl: asFetch(fetchImpl),
    });

    expect(snapshot.values).toEqual({ APP_AUTH: "remote-auth", S3_BUCKET: "bucket" });
    expect(snapshot.version).toBe(3);
    expect(snapshot.expiresAt).toBe(nowMs + 300_000);

    const [calledUrl, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    const url = new URL(calledUrl);
    expect(url.origin).toBe("https://config.example.com");
    expect(url.pathname).toBe("/api/config");
    expect(url.searchParams.get("app_key")).toBe(BASE.appKey);
    expect(url.searchParams.get("app_secret")).toBe(BASE.appSecret);
    expect(url.searchParams.get("project")).toBe(BASE.project);
    expect(url.searchParams.get("environment")).toBe(BASE.environment);
    expect(url.searchParams.get("group")).toBe(BASE.group);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toMatchObject({
      "user-agent": expect.stringContaining("bendy-shadowsend/"),
    });
  });

  it("treats an empty content body as an empty key set", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody("")));
    const snapshot = await fetchConfigCenterSnapshot({
      ...BASE,
      env: {},
      now,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    });
    expect(snapshot.values).toEqual({});
  });

  it("raises a typed error on non-200 responses", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false }, 503));
    await expect(
      fetchConfigCenterSnapshot({
        ...BASE,
        env: {},
        now,
        logger: createLogger(),
        fetchImpl: asFetch(fetchImpl),
      }),
    ).rejects.toMatchObject({ code: "CONFIG_HTTP_503" });
  });

  it("propagates config center business error codes", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ success: false, code: "UNAUTHORIZED", error: "invalid app secret" }),
    );
    await expect(
      fetchConfigCenterSnapshot({
        ...BASE,
        env: {},
        now,
        logger: createLogger(),
        fetchImpl: asFetch(fetchImpl),
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "invalid app secret" });
  });

  it("aborts requests that exceed the configured timeout", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const promise = fetchConfigCenterSnapshot({
      ...BASE,
      env: {},
      now,
      timeoutMs: 1_500,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    });
    const assertion = expect(promise).rejects.toMatchObject({ code: "CONFIG_TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1_500);
    await assertion;
  });

  it("refuses to fetch when the client is not configured", async () => {
    const fetchImpl = vi.fn();
    await expect(
      fetchConfigCenterSnapshot({ env: {}, fetchImpl: asFetch(fetchImpl) }),
    ).rejects.toBeInstanceOf(ConfigCenterError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("ensureConfigLoaded", () => {
  it("does nothing and reports false when config center is not configured", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn();

    const loaded = await ensureConfigLoaded({ env: {}, logger, fetchImpl: asFetch(fetchImpl) });

    expect(loaded).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("Source: VercelEnv"),
      expect.anything(),
    );
  });

  it("loads a snapshot and logs Source: ConfigCenter", async () => {
    const logger = createLogger();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth" }))),
    );

    const loaded = await ensureConfigLoaded({
      ...BASE,
      env: {},
      now,
      logger,
      fetchImpl: asFetch(fetchImpl),
    });

    expect(loaded).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "[config-center] Source: ConfigCenter",
      expect.objectContaining({ version: 3, keys: 1 }),
    );
  });

  it("reuses the cached snapshot until the TTL expires", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth" }))),
    );
    const overrides = {
      ...BASE,
      env: {},
      now,
      ttlMs: 10_000,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    };

    await ensureConfigLoaded(overrides);
    await ensureConfigLoaded(overrides);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    nowMs += 10_000;
    await ensureConfigLoaded(overrides);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("backs off after a failure instead of hammering the config center", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const logger = createLogger();
    const overrides = {
      ...BASE,
      env: {},
      now,
      retryMs: 1_000,
      logger,
      fetchImpl: asFetch(fetchImpl),
    };

    await expect(ensureConfigLoaded(overrides)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Source: VercelEnv"),
      expect.objectContaining({ reason: expect.stringContaining("CONFIG_NETWORK_ERROR") }),
    );

    await expect(ensureConfigLoaded(overrides)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    nowMs += 1_000;
    await expect(ensureConfigLoaded(overrides)).resolves.toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps serving the previous snapshot when a refresh fails", async () => {
    const successFetch = vi.fn(async () =>
      jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth" }))),
    );
    const overrides = {
      ...BASE,
      env: {},
      now,
      ttlMs: 10_000,
      retryMs: 1_000,
      logger: createLogger(),
      fetchImpl: asFetch(successFetch),
    };
    await ensureConfigLoaded(overrides);

    nowMs += 10_000;
    const failingFetch = vi.fn(async () => jsonResponse({ success: false }, 500));
    const refreshed = await ensureConfigLoaded(
      { ...overrides, fetchImpl: asFetch(failingFetch) },
      { force: true },
    );

    expect(refreshed).toBe(false);
    expect(
      getConfigValue("APP_AUTH", undefined, { overrides: { env: {} } }),
    ).toBe("remote-auth");
  });

  it("deduplicates concurrent loads into a single request", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const overrides = {
      ...BASE,
      env: {},
      now,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    };

    const first = ensureConfigLoaded(overrides);
    const second = ensureConfigLoaded(overrides);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch?.(jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth" }))));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("getConfigEntry / getConfigValue", () => {
  async function loadRemote(values: Record<string, string>) {
    const fetchImpl = vi.fn(async () => jsonResponse(okBody(JSON.stringify(values))));
    await ensureConfigLoaded({
      ...BASE,
      env: {},
      now,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    });
  }

  it("prefers a non-empty config center value", async () => {
    await loadRemote({ APP_AUTH: "remote-auth" });
    expect(
      getConfigEntry("APP_AUTH", "fallback", {
        overrides: { env: { APP_AUTH: "env-auth" } },
      }),
    ).toEqual({ value: "remote-auth", source: "ConfigCenter" });
  });

  it("falls back to the environment when the remote value is empty", async () => {
    await loadRemote({ APP_AUTH: "" });
    expect(
      getConfigEntry("APP_AUTH", undefined, {
        overrides: { env: { APP_AUTH: "env-auth" } },
      }),
    ).toEqual({ value: "env-auth", source: "VercelEnv" });
  });

  it("falls back to the environment when the key is absent remotely", async () => {
    await loadRemote({ S3_BUCKET: "remote-bucket" });
    expect(
      getConfigValue("APP_AUTH", undefined, {
        overrides: { env: { APP_AUTH: "env-auth" } },
      }),
    ).toBe("env-auth");
  });

  it("falls back when a remote value fails validation", async () => {
    await loadRemote({ S3_ENDPOINT: "not-a-url" });
    const entry = getConfigEntry("S3_ENDPOINT", undefined, {
      validate: (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      overrides: { env: { S3_ENDPOINT: "https://env.example.com" } },
    });
    expect(entry).toEqual({ value: "https://env.example.com", source: "VercelEnv" });
  });

  it("returns the caller fallback when neither source has a value", async () => {
    await loadRemote({});
    expect(getConfigValue("MISSING_KEY", "fallback", { overrides: { env: {} } })).toBe(
      "fallback",
    );
    expect(getConfigValue("MISSING_KEY", undefined, { overrides: { env: {} } })).toBe(
      undefined,
    );
  });

  it("uses environment values when no snapshot has been loaded", () => {
    expect(
      getConfigValue("APP_AUTH", undefined, { overrides: { env: { APP_AUTH: "env-auth" } } }),
    ).toBe("env-auth");
  });

  it("logs once when an environment value fails validation", () => {
    const logger = createLogger();
    const validate = (value: string) => value.startsWith("https://");
    const overrides = { env: { S3_ENDPOINT: "ftp://nope" }, logger };

    expect(
      getConfigValue("S3_ENDPOINT", undefined, { validate, overrides }),
    ).toBeUndefined();
    expect(
      getConfigValue("S3_ENDPOINT", undefined, { validate, overrides }),
    ).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      "[config-center] key=S3_ENDPOINT environment value failed validation",
    );
  });
});

describe("getConfigStatus", () => {
  it("reports the loaded snapshot without leaking values", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(okBody(JSON.stringify({ APP_AUTH: "remote-auth", S3_BUCKET: "bucket" }), "json", 7)),
    );
    await ensureConfigLoaded({
      ...BASE,
      env: {},
      now,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    });

    const status = getConfigStatus({ ...BASE, env: {}, now });
    expect(status).toMatchObject({
      enabled: true,
      source: "ConfigCenter",
      stale: false,
      version: 7,
      keyCount: 2,
      lastError: null,
    });
    expect(JSON.stringify(status)).not.toContain("remote-auth");
  });

  it("reports the last failure and fallback source when the first load fails", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ success: false }, 500));
    await ensureConfigLoaded({
      ...BASE,
      env: {},
      now,
      logger: createLogger(),
      fetchImpl: asFetch(fetchImpl),
    });

    const status = getConfigStatus({ ...BASE, env: {}, now });
    expect(status.source).toBe("VercelEnv");
    expect(status.loadedAt).toBeNull();
    expect(status.lastErrorCode).toBe("CONFIG_HTTP_500");
    expect(status.nextRetryAt).not.toBeNull();
  });
});
