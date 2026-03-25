import { NextRequest, NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { assertAuthFormat, getCurrentAppAuth, maskAuth } from "@/lib/system-auth";

type ChangeAuthParams = {
  oldAuth: string | null;
  nextAuth: string | null;
};

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function readParams(request: NextRequest): Promise<ChangeAuthParams> {
  const queryOld = request.nextUrl.searchParams.get("old");
  const queryNew = request.nextUrl.searchParams.get("new");

  if (request.method === "GET") {
    return { oldAuth: queryOld, nextAuth: queryNew };
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const bodyOld =
    body && typeof body === "object" && typeof (body as { old?: unknown }).old === "string"
      ? (body as { old: string }).old
      : null;
  const bodyNew =
    body && typeof body === "object" && typeof (body as { new?: unknown }).new === "string"
      ? (body as { new: string }).new
      : null;

  return {
    oldAuth: queryOld ?? bodyOld,
    nextAuth: queryNew ?? bodyNew,
  };
}

async function handleRequest(request: NextRequest) {
  const { oldAuth, nextAuth } = await readParams(request);
  const requestIp = getRequestIp(request);

  if (!oldAuth || !nextAuth) {
    return NextResponse.json(
      {
        error: "old and new are required",
      },
      { status: 400 },
    );
  }

  try {
    const normalizedOld = assertAuthFormat(oldAuth, "old");
    const normalizedNew = assertAuthFormat(nextAuth, "new");
    const currentAuth = await getCurrentAppAuth();

    if (normalizedOld !== currentAuth) {
      console.warn("[system:changeAuth] auth verification failed", {
        at: new Date().toISOString(),
        ip: requestIp,
        old: maskAuth(normalizedOld),
      });
      return NextResponse.json(
        {
          error: "old auth invalid",
        },
        { status: 403 },
      );
    }

    await prisma.appAuthConfig.update({
      where: { id: "default" },
      data: {
        auth: normalizedNew,
      },
    });

    console.info("[system:changeAuth] auth updated", {
      at: new Date().toISOString(),
      ip: requestIp,
      old: maskAuth(normalizedOld),
      next: maskAuth(normalizedNew),
    });

    return NextResponse.json({
      success: true,
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
        error: "failed to change auth",
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
