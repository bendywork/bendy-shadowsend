import { NextRequest, NextResponse } from "next/server";
import { APP_NAME, ONLINE_WINDOW_MS } from "@/lib/constants";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifyAppAuth } from "@/lib/system-auth";

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

function parseUrlInfo(rawUrl: string | undefined) {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    return {
      raw: rawUrl,
      protocol: parsed.protocol.replace(":", ""),
      host: parsed.hostname,
      port: parsed.port || null,
      path: parsed.pathname,
      origin: parsed.origin,
    };
  } catch {
    return {
      raw: rawUrl,
      protocol: null,
      host: null,
      port: null,
      path: null,
      origin: null,
    };
  }
}

async function readAuthParam(request: NextRequest) {
  const queryAuth = request.nextUrl.searchParams.get("auth");
  if (queryAuth) return queryAuth;

  if (request.method === "GET") {
    return null;
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (body && typeof body === "object" && typeof (body as { auth?: unknown }).auth === "string") {
    return (body as { auth: string }).auth;
  }

  return null;
}

async function handleRequest(request: NextRequest) {
  const auth = await readAuthParam(request);
  const requestIp = getRequestIp(request);

  if (!auth) {
    console.info("[system:getInfo] public info requested", {
      at: new Date().toISOString(),
      ip: requestIp,
      withAuth: false,
    });
    return NextResponse.json({
      title: APP_NAME,
      version: env.appVersion,
    });
  }

  const valid = await verifyAppAuth(auth);
  if (!valid) {
    console.warn("[system:getInfo] auth failed", {
      at: new Date().toISOString(),
      ip: requestIp,
    });
    return NextResponse.json(
      {
        error: "auth failed",
      },
      { status: 403 },
    );
  }

  const activeSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const [onlineUsers, allRooms, onlineRoomRows] = await Promise.all([
    prisma.presence.count({
      where: {
        lastSeenAt: { gte: activeSince },
      },
    }),
    prisma.room.count(),
    prisma.presence.findMany({
      where: {
        roomId: { not: null },
        lastSeenAt: { gte: activeSince },
      },
      select: {
        roomId: true,
      },
      distinct: ["roomId"],
    }),
  ]);

  const response = {
    title: APP_NAME,
    version: env.appVersion,
    onlineRooms: onlineRoomRows.length,
    Rooms: allRooms,
    rooms: allRooms,
    onlineUsers,
    serverAddress: request.nextUrl.origin,
    fileServerInfo: {
      Dufs: {
        baseUrl: env.dufs.baseUrl ?? null,
        publicBaseUrl: env.dufs.publicBaseUrl ?? null,
        pathPrefix: env.dufs.pathPrefix ?? null,
        auth: env.dufs.auth ?? null,
        baseParsed: parseUrlInfo(env.dufs.baseUrl),
        publicParsed: parseUrlInfo(env.dufs.publicBaseUrl),
      },
      S1: {
        region: env.s3.region,
        endpoint: env.s3.endpoint ?? null,
        bucket: env.s3.bucket ?? null,
        accessKeyId: env.s3.accessKeyId ?? null,
        secretAccessKey: env.s3.secretAccessKey ?? null,
        forcePathStyle: env.s3.forcePathStyle,
        endpointParsed: parseUrlInfo(env.s3.endpoint),
      },
      dufs: {
        baseUrl: env.dufs.baseUrl ?? null,
        publicBaseUrl: env.dufs.publicBaseUrl ?? null,
        pathPrefix: env.dufs.pathPrefix ?? null,
        auth: env.dufs.auth ?? null,
        baseParsed: parseUrlInfo(env.dufs.baseUrl),
        publicParsed: parseUrlInfo(env.dufs.publicBaseUrl),
      },
      s1: {
        region: env.s3.region,
        endpoint: env.s3.endpoint ?? null,
        bucket: env.s3.bucket ?? null,
        accessKeyId: env.s3.accessKeyId ?? null,
        secretAccessKey: env.s3.secretAccessKey ?? null,
        forcePathStyle: env.s3.forcePathStyle,
        endpointParsed: parseUrlInfo(env.s3.endpoint),
      },
    },
  };

  console.info("[system:getInfo] privileged info requested", {
    at: new Date().toISOString(),
    ip: requestIp,
    onlineRooms: response.onlineRooms,
    rooms: response.Rooms,
    onlineUsers: response.onlineUsers,
  });

  return NextResponse.json(response);
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
