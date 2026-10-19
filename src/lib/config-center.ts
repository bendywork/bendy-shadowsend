/**
 * 笨迪配置中心（Bendy Config Center）客户端。
 *
 * 配置读取遵循「配置中心优先 + 平台环境变量兜底」：
 *   1. 配置中心返回的非空值优先（Source: ConfigCenter）；
 *   2. 配置中心不可用、缺少该键或值为空时，回退 process.env（Source: VercelEnv）；
 *   3. 两者都没有时返回调用方提供的默认值。
 *
 * 设计约束：
 * - 读取接口对业务层透明：`getConfigValue("KEY")` 同步返回，绝不抛错；
 * - 拉取带硬超时（默认 2500ms，1500ms~3000ms 为推荐区间），失败只记录日志；
 * - 成功结果缓存在进程内存，TTL（默认 5 分钟）到期后懒刷新；刷新失败时继续
 *   使用上一份快照（stale-on-error），保证配置中心宕机时服务仍可用；
 * - 日志只记录键名、来源与状态，绝不输出配置值或 app_secret。
 */

import { APP_VERSION } from "@/lib/constants";

export type ConfigSource = "ConfigCenter" | "VercelEnv";

export interface ConfigLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface ConfigCenterOverrides {
  url?: string;
  appKey?: string;
  appSecret?: string;
  project?: string;
  environment?: string;
  group?: string;
  timeoutMs?: number;
  ttlMs?: number;
  retryMs?: number;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  logger?: ConfigLogger;
}

export interface ResolvedConfigCenterConfig {
  enabled: boolean;
  url: string;
  appKey: string;
  appSecret: string;
  project: string;
  environment: string;
  group: string;
  timeoutMs: number;
  ttlMs: number;
  retryMs: number;
}

export interface LoadedConfig {
  values: Record<string, string>;
  version: number | null;
  loadedAt: number;
  expiresAt: number;
  project: string;
  environment: string;
  group: string;
}

export interface ConfigCenterStatus {
  enabled: boolean;
  source: ConfigSource;
  stale: boolean;
  loadedAt: string | null;
  expiresAt: string | null;
  version: number | null;
  project: string;
  environment: string;
  group: string;
  keyCount: number;
  timeoutMs: number;
  ttlMs: number;
  lastError: string | null;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  nextRetryAt: string | null;
}

export interface GetConfigOptions {
  /** 值校验；不通过时继续尝试下一个来源。 */
  validate?: (value: string) => boolean;
  overrides?: ConfigCenterOverrides;
}

export interface ConfigEntry {
  value: string | undefined;
  source: ConfigSource;
}

export class ConfigCenterError extends Error {
  code: string;

  constructor(message: string, code = "CONFIG_CENTER_ERROR") {
    super(message);
    this.name = "ConfigCenterError";
    this.code = code;
  }
}

interface FailureState {
  message: string;
  code: string;
  at: number;
  attempts: number;
  nextRetryAt: number;
}

const DEFAULT_PROJECT = "bendy-shadowsend";
const DEFAULT_GROUP = "app-config";
const DEFAULT_TIMEOUT_MS = 2_500;
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_RETRY_MS = 30_000;
const MAX_RETRY_MS = 5 * 60_000;

let snapshot: LoadedConfig | null = null;
let failure: FailureState | null = null;
let inflight: Promise<boolean> | null = null;
const fallbackLogged = new Set<string>();
const invalidEnvLogged = new Set<string>();
let disabledLogged = false;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(
  raw: string | number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = typeof raw === "number" ? raw : Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function defaultEnvironment(env: Record<string, string | undefined>): string {
  if (env.CONFIG_CENTER_ENVIRONMENT) return env.CONFIG_CENTER_ENVIRONMENT;
  switch (env.VERCEL_ENV) {
    case "production":
      return "prod";
    case "preview":
      return "pre";
    case "development":
      return "dev";
    default:
      return "dev";
  }
}

/**
 * 解析配置中心引导参数。引导参数本身只能来自环境变量（自举依赖）。
 */
export function resolveConfigCenterConfig(
  overrides: ConfigCenterOverrides = {},
): ResolvedConfigCenterConfig {
  const env = overrides.env ?? process.env;
  const url = trimTrailingSlash((overrides.url ?? env.CONFIG_CENTER_URL ?? "").trim());
  const appKey = (overrides.appKey ?? env.CONFIG_CENTER_APP_KEY ?? "").trim();
  const appSecret = (overrides.appSecret ?? env.CONFIG_CENTER_APP_SECRET ?? "").trim();
  const project = (overrides.project ?? env.CONFIG_CENTER_PROJECT ?? DEFAULT_PROJECT).trim();
  const environment = (
    overrides.environment ?? defaultEnvironment(env)
  ).trim();
  const group = (overrides.group ?? env.CONFIG_CENTER_GROUP ?? DEFAULT_GROUP).trim();
  const disabledByFlag = env.CONFIG_CENTER_ENABLED === "false";
  const enabled = !disabledByFlag && Boolean(url && appKey && appSecret && project && environment && group);

  return {
    enabled,
    url,
    appKey,
    appSecret,
    project,
    environment,
    group,
    timeoutMs: clampInt(
      overrides.timeoutMs ?? env.CONFIG_CENTER_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      500,
      10_000,
    ),
    ttlMs: clampInt(
      overrides.ttlMs ?? env.CONFIG_CENTER_TTL_MS,
      DEFAULT_TTL_MS,
      5_000,
      3_600_000,
    ),
    retryMs: clampInt(
      overrides.retryMs ?? env.CONFIG_CENTER_RETRY_MS,
      DEFAULT_RETRY_MS,
      1_000,
      300_000,
    ),
  };
}

/**
 * 把配置中心返回的内容解析成扁平键值表。
 *
 * 支持 JSON（嵌套对象用点号打平）、properties / ini / text（KEY=VALUE 行）。
 * yaml / toml 暂不解析——遇到不支持的格式会抛错并触发环境变量兜底。
 */
export function parseConfigContent(content: string, format = "json"): Map<string, string> {
  const normalized = (format || "json").trim().toLowerCase();
  switch (normalized) {
    case "json":
      return parseJsonConfig(content);
    case "properties":
      return parseKeyValueConfig(content, false);
    case "ini":
      return parseKeyValueConfig(content, true);
    case "text":
      return parseKeyValueConfig(content, false);
    default:
      throw new ConfigCenterError(
        `unsupported config format: ${normalized}`,
        "CONFIG_FORMAT_UNSUPPORTED",
      );
  }
}

function parseJsonConfig(content: string): Map<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConfigCenterError("config content is not valid JSON", "CONFIG_JSON_INVALID");
  }
  if (!isRecord(parsed)) {
    throw new ConfigCenterError("config content must be a JSON object", "CONFIG_JSON_INVALID");
  }
  const values = new Map<string, string>();
  flattenInto(parsed, "", values);
  return values;
}

function flattenInto(
  value: unknown,
  prefix: string,
  out: Map<string, string>,
): void {
  if (value === null || value === undefined) {
    if (prefix) out.set(prefix, "");
    return;
  }
  if (Array.isArray(value)) {
    if (prefix) out.set(prefix, JSON.stringify(value));
    return;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0 && prefix) {
      out.set(prefix, "");
      return;
    }
    for (const [key, child] of entries) {
      flattenInto(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  if (prefix) out.set(prefix, String(value));
}

function parseKeyValueConfig(content: string, ini: boolean): Map<string, string> {
  const values = new Map<string, string>();
  let section = "";
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (ini) {
      const sectionMatch = /^\[([^\]]+)\]$/.exec(line);
      if (sectionMatch) {
        section = sectionMatch[1].trim();
        continue;
      }
    }
    const separator = line.search(/[=:]/);
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    values.set(section ? `${section}.${key}` : key, value);
  }
  return values;
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

/**
 * 拉取一次配置中心快照。失败时抛 ConfigCenterError，由调用方决定兜底策略。
 */
export async function fetchConfigCenterSnapshot(
  overrides: ConfigCenterOverrides = {},
): Promise<LoadedConfig> {
  const config = resolveConfigCenterConfig(overrides);
  if (!config.enabled) {
    throw new ConfigCenterError("config center is not configured", "CONFIG_CENTER_DISABLED");
  }

  const fetchImpl = overrides.fetchImpl ?? fetch;
  const now = overrides.now ?? Date.now;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const url = new URL(`${config.url}/api/config`);
    url.searchParams.set("app_key", config.appKey);
    url.searchParams.set("app_secret", config.appSecret);
    url.searchParams.set("project", config.project);
    url.searchParams.set("environment", config.environment);
    url.searchParams.set("group", config.group);

    const response = await fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": `bendy-shadowsend/${APP_VERSION}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ConfigCenterError(
        `config center responded HTTP ${response.status}`,
        `CONFIG_HTTP_${response.status}`,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ConfigCenterError(
        "config center returned invalid JSON",
        "CONFIG_RESPONSE_INVALID",
      );
    }

    if (!isRecord(body) || body.success !== true) {
      const code =
        isRecord(body) && typeof body.code === "string"
          ? body.code
          : "CONFIG_RESPONSE_INVALID";
      const message =
        isRecord(body) && typeof body.error === "string"
          ? body.error
          : "config center returned an error";
      throw new ConfigCenterError(message, code);
    }

    if (!isRecord(body.data)) {
      throw new ConfigCenterError(
        "config center response is missing data",
        "CONFIG_RESPONSE_INVALID",
      );
    }

    const data = body.data;
    const rawContent = typeof data.content === "string" ? data.content : "";
    const format = typeof data.format === "string" ? data.format : "json";
    const values =
      rawContent.trim() === ""
        ? {}
        : Object.fromEntries(parseConfigContent(rawContent, format));

    const loadedAt = now();
    return {
      values,
      version:
        typeof data.version === "number" && Number.isFinite(data.version)
          ? data.version
          : null,
      loadedAt,
      expiresAt: loadedAt + config.ttlMs,
      project: config.project,
      environment: config.environment,
      group: config.group,
    };
  } catch (error) {
    if (error instanceof ConfigCenterError) throw error;
    if (isAbortError(error)) {
      throw new ConfigCenterError(
        `config center request timed out after ${config.timeoutMs}ms`,
        "CONFIG_TIMEOUT",
      );
    }
    throw new ConfigCenterError(
      error instanceof Error ? error.message : String(error),
      "CONFIG_NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 确保内存中有一份未过期的配置中心快照。
 *
 * - 未配置配置中心：返回 false，不发起任何请求；
 * - 快照未过期：直接返回 true；
 * - 上次失败且仍在退避窗口内：返回 false，避免请求风暴；
 * - 并发调用共享同一个 in-flight 请求。
 */
export async function ensureConfigLoaded(
  overrides: ConfigCenterOverrides = {},
  options: { force?: boolean } = {},
): Promise<boolean> {
  const config = resolveConfigCenterConfig(overrides);
  const logger = overrides.logger ?? console;

  if (!config.enabled) {
    if (!disabledLogged) {
      disabledLogged = true;
      logger.info("[config-center] Source: VercelEnv (config center not configured)", {
        project: config.project,
        environment: config.environment,
        group: config.group,
      });
    }
    return false;
  }

  const now = (overrides.now ?? Date.now)();
  if (!options.force && snapshot && now < snapshot.expiresAt) return true;
  if (!options.force && failure && now < failure.nextRetryAt) return false;
  if (inflight) return inflight;

  const startedAt = now;
  inflight = (async () => {
    try {
      const loaded = await fetchConfigCenterSnapshot(overrides);
      snapshot = loaded;
      failure = null;
      logger.info("[config-center] Source: ConfigCenter", {
        project: loaded.project,
        environment: loaded.environment,
        group: loaded.group,
        version: loaded.version,
        keys: Object.keys(loaded.values).length,
        durationMs: Math.max(0, loaded.loadedAt - startedAt),
        ttlMs: config.ttlMs,
      });
      return true;
    } catch (error) {
      const normalized =
        error instanceof ConfigCenterError
          ? error
          : new ConfigCenterError(
              error instanceof Error ? error.message : String(error),
            );
      const attempts = (failure?.attempts ?? 0) + 1;
      const at = (overrides.now ?? Date.now)();
      const backoffMs = Math.min(
        config.retryMs * 2 ** Math.max(0, attempts - 1),
        MAX_RETRY_MS,
      );
      failure = {
        message: normalized.message,
        code: normalized.code,
        at,
        attempts,
        nextRetryAt: at + backoffMs,
      };

      if (snapshot) {
        logger.warn("[config-center] Source: ConfigCenter (stale) — refresh failed", {
          reason: `${normalized.code}: ${normalized.message}`,
          attempts,
          staleSince: new Date(snapshot.loadedAt).toISOString(),
          nextRetryAt: new Date(failure.nextRetryAt).toISOString(),
        });
      } else {
        logger.warn("[config-center] Source: VercelEnv — config center unavailable", {
          reason: `${normalized.code}: ${normalized.message}`,
          attempts,
          nextRetryAt: new Date(failure.nextRetryAt).toISOString(),
          project: config.project,
          environment: config.environment,
          group: config.group,
        });
      }
      return false;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 服务启动时预热配置；失败不阻塞启动。 */
export async function initializeConfigCenter(
  overrides: ConfigCenterOverrides = {},
): Promise<boolean> {
  return ensureConfigLoaded(overrides);
}

/**
 * 后台定时刷新（TTL 轮询）。返回停止函数。
 * 仅在配置中心启用时创建定时器；serverless 实例休眠后由下次访问懒刷新兜底。
 */
export function startConfigAutoRefresh(
  overrides: ConfigCenterOverrides = {},
): () => void {
  const config = resolveConfigCenterConfig(overrides);
  if (!config.enabled) return () => {};
  const intervalMs = Math.max(30_000, config.ttlMs);
  const timer = setInterval(() => {
    void ensureConfigLoaded(overrides, { force: true });
  }, intervalMs);
  if (
    typeof timer === "object" &&
    timer !== null &&
    "unref" in timer &&
    typeof timer.unref === "function"
  ) {
    timer.unref();
  }
  return () => clearInterval(timer);
}

function maybeRefresh(overrides?: ConfigCenterOverrides): void {
  const config = resolveConfigCenterConfig(overrides);
  if (!config.enabled) return;
  const now = (overrides?.now ?? Date.now)();
  if (snapshot && now < snapshot.expiresAt) return;
  if (failure && now < failure.nextRetryAt) return;
  if (inflight) return;
  void ensureConfigLoaded(overrides);
}

function logFallbackOnce(
  key: string,
  reason: string,
  logger: ConfigLogger,
): void {
  if (fallbackLogged.has(key)) return;
  fallbackLogged.add(key);
  logger.info(`[config-center] key=${key} Source: VercelEnv`, { reason });
}

/**
 * 读取一个配置项及其来源。
 *
 * 优先级：配置中心非空值 > 环境变量 > fallback。
 * `validate` 用于跳过非法值（例如格式错误的 URL），继续尝试下一个来源。
 */
export function getConfigEntry(
  key: string,
  fallback?: string,
  options: GetConfigOptions = {},
): ConfigEntry {
  const overrides = options.overrides;
  const env = overrides?.env ?? process.env;
  const validate = options.validate;

  maybeRefresh(overrides);

  const remote = snapshot?.values[key];
  if (remote !== undefined && remote.trim() !== "" && (!validate || validate(remote))) {
    return { value: remote, source: "ConfigCenter" };
  }

  if (snapshot) {
    const reason =
      remote === undefined
        ? "key not present in config center"
        : remote.trim() === ""
          ? "empty value in config center"
          : "remote value failed validation";
    logFallbackOnce(key, reason, overrides?.logger ?? console);
  }

  const envValue = env[key];
  if (envValue !== undefined && envValue !== "") {
    if (!validate || validate(envValue)) {
      return { value: envValue, source: "VercelEnv" };
    }
    if (!invalidEnvLogged.has(key)) {
      invalidEnvLogged.add(key);
      (overrides?.logger ?? console).warn(
        `[config-center] key=${key} environment value failed validation`,
      );
    }
  }

  if (fallback !== undefined && (!validate || validate(fallback))) {
    return { value: fallback, source: "VercelEnv" };
  }

  return { value: undefined, source: "VercelEnv" };
}

/** 同步读取配置值（配置中心优先，环境变量兜底）。 */
export function getConfigValue(
  key: string,
  fallback?: string,
  options: GetConfigOptions = {},
): string | undefined {
  return getConfigEntry(key, fallback, options).value;
}

/** 配置中心运行状态（用于诊断接口，不含任何密钥）。 */
export function getConfigStatus(
  overrides: ConfigCenterOverrides = {},
): ConfigCenterStatus {
  const config = resolveConfigCenterConfig(overrides);
  const now = (overrides.now ?? Date.now)();
  const current = snapshot;

  return {
    enabled: config.enabled,
    source: current ? "ConfigCenter" : "VercelEnv",
    stale: current ? now >= current.expiresAt : false,
    loadedAt: current ? new Date(current.loadedAt).toISOString() : null,
    expiresAt: current ? new Date(current.expiresAt).toISOString() : null,
    version: current?.version ?? null,
    project: config.project,
    environment: config.environment,
    group: config.group,
    keyCount: snapshot ? Object.keys(snapshot.values).length : 0,
    timeoutMs: config.timeoutMs,
    ttlMs: config.ttlMs,
    lastError: failure?.message ?? null,
    lastErrorCode: failure?.code ?? null,
    lastErrorAt: failure ? new Date(failure.at).toISOString() : null,
    nextRetryAt: failure ? new Date(failure.nextRetryAt).toISOString() : null,
  };
}

/** 仅供测试：清空模块级缓存与日志去重状态。 */
export function resetConfigCenterForTests(): void {
  snapshot = null;
  failure = null;
  inflight = null;
  fallbackLogged.clear();
  invalidEnvLogged.clear();
  disabledLogged = false;
}
