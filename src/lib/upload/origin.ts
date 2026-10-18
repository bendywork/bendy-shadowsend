export type OriginCheckInput = {
  origin: string | null;
  referer: string | null;
  host: string | null;
  forwardedHost: string | null;
  secFetchSite: string | null;
  allowedOrigins?: string[];
};

function normalizeHost(value: string | null | undefined): string | null {
  const trimmed = value?.split(",")[0]?.trim().toLowerCase();
  return trimmed || null;
}

function hostFromOrigin(value: string): string | null {
  if (!value || value === "null") {
    return null;
  }

  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveAllowedHosts(input: OriginCheckInput): Set<string> {
  const hosts = new Set<string>();
  const host = normalizeHost(input.host);
  const forwardedHost = normalizeHost(input.forwardedHost);

  if (host) hosts.add(host);
  if (forwardedHost) hosts.add(forwardedHost);

  for (const origin of input.allowedOrigins ?? []) {
    const originHost = hostFromOrigin(origin);
    if (originHost) {
      hosts.add(originHost);
      continue;
    }

    const normalized = normalizeHost(origin);
    if (normalized) hosts.add(normalized);
  }

  return hosts;
}

export function isSameOriginUpload(input: OriginCheckInput): boolean {
  if (input.secFetchSite?.toLowerCase() === "cross-site") {
    return false;
  }

  const allowedHosts = resolveAllowedHosts(input);
  if (allowedHosts.size === 0) {
    return false;
  }

  const source = input.origin ?? input.referer;
  const sourceHost = source ? hostFromOrigin(source) : null;

  return Boolean(sourceHost && allowedHosts.has(sourceHost));
}
