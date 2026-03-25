import { ApiError } from "@/lib/api";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const APP_AUTH_CONFIG_ID = "default";

export function assertAuthFormat(value: string, field = "auth") {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 32) {
    throw new ApiError(400, `${field} length must be between 1 and 32`, "INVALID_AUTH_LENGTH");
  }
  return normalized;
}

export async function getCurrentAppAuth() {
  const row = await prisma.appAuthConfig.upsert({
    where: { id: APP_AUTH_CONFIG_ID },
    create: {
      id: APP_AUTH_CONFIG_ID,
      auth: assertAuthFormat(env.appAuth),
    },
    update: {},
    select: { auth: true },
  });
  return row.auth;
}

export async function verifyAppAuth(input: string | null | undefined) {
  if (!input) return false;
  const current = await getCurrentAppAuth();
  return input === current;
}

export function maskAuth(value: string | null | undefined) {
  if (!value) return "<empty>";
  if (value.length <= 2) return "*".repeat(value.length);
  return `${value.slice(0, 1)}${"*".repeat(Math.max(1, value.length - 2))}${value.slice(-1)}`;
}
