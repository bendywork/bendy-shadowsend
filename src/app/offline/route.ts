import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import {
  getScheduledOfflineAt,
  scheduleOfflineAt,
  triggerOfflineSoon,
} from "@/lib/system-control";
import { verifyAppAuth } from "@/lib/system-auth";

type OfflineParams = {
  auth: string | null;
  time: string | null;
};

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function parseTimeParam(value: string) {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(normalized);
  if (!match) {
    throw new ApiError(400, "time must use format yyyy-MM-dd HH:mm:ss", "INVALID_TIME_FORMAT");
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const hour = Number.parseInt(match[4], 10);
  const minute = Number.parseInt(match[5], 10);
  const second = Number.parseInt(match[6], 10);

  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day ||
    parsed.getHours() !== hour ||
    parsed.getMinutes() !== minute ||
    parsed.getSeconds() !== second
  ) {
    throw new ApiError(400, "time is not a valid calendar datetime", "INVALID_TIME_VALUE");
  }

  return parsed;
}

async function readParams(request: NextRequest): Promise<OfflineParams> {
  const queryAuth = request.nextUrl.searchParams.get("auth");
  const queryTime = request.nextUrl.searchParams.get("time");

  if (request.method === "GET") {
    return { auth: queryAuth, time: queryTime };
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const bodyAuth =
    body && typeof body === "object" && typeof (body as { auth?: unknown }).auth === "string"
      ? (body as { auth: string }).auth
      : null;
  const bodyTime =
    body && typeof body === "object" && typeof (body as { time?: unknown }).time === "string"
      ? (body as { time: string }).time
      : null;

  return {
    auth: queryAuth ?? bodyAuth,
    time: queryTime ?? bodyTime,
  };
}

async function handleRequest(request: NextRequest) {
  const { auth, time } = await readParams(request);
  const requestIp = getRequestIp(request);

  if (!auth) {
    console.warn("[system:offline] auth missing", {
      at: new Date().toISOString(),
      ip: requestIp,
      hasTime: Boolean(time),
    });
    return NextResponse.json(
      {
        error: "auth failed",
      },
      { status: 403 },
    );
  }

  const valid = await verifyAppAuth(auth);
  if (!valid) {
    console.warn("[system:offline] auth failed", {
      at: new Date().toISOString(),
      ip: requestIp,
      hasTime: Boolean(time),
    });
    return NextResponse.json(
      {
        error: "auth failed",
      },
      { status: 403 },
    );
  }

  if (!time) {
    const targetAt = triggerOfflineSoon(120);
    console.info("[system:offline] shutdown requested immediately", {
      at: new Date().toISOString(),
      ip: requestIp,
      targetAt: targetAt.toISOString(),
    });
    return NextResponse.json({
      success: true,
      mode: "immediate",
      scheduledAt: targetAt.toISOString(),
    });
  }

  try {
    const previousScheduledAt = getScheduledOfflineAt();
    const targetAt = parseTimeParam(time);
    scheduleOfflineAt(targetAt);
    console.info("[system:offline] shutdown scheduled", {
      at: new Date().toISOString(),
      ip: requestIp,
      targetAt: targetAt.toISOString(),
    });
    return NextResponse.json({
      success: true,
      mode: "scheduled",
      scheduledAt: targetAt.toISOString(),
      previousScheduledAt: previousScheduledAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "failed to schedule offline",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
