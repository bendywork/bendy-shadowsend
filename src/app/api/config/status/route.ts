import { NextRequest, NextResponse } from "next/server";
import { ensureConfigLoaded, getConfigStatus } from "@/lib/config-center";
import { verifyAppAuth } from "@/lib/system-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "cache-control": "no-store" } as const;

/**
 * 配置中心诊断接口。
 *
 * - 未带 auth：只返回 source/enabled/stale，够判断当前是否走配置中心；
 * - 带正确 auth：返回完整状态（项目、环境、组、版本、加载时间、错误码）。
 *
 * 响应中永远不包含 app_secret 或任何配置值。
 */
export async function GET(request: NextRequest) {
  await ensureConfigLoaded();
  const status = getConfigStatus();

  const auth = request.nextUrl.searchParams.get("auth");
  let authorized = false;
  if (auth) {
    try {
      authorized = await verifyAppAuth(auth);
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return NextResponse.json(
      {
        ok: true,
        data: {
          enabled: status.enabled,
          source: status.source,
          stale: status.stale,
        },
      },
      { headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true, data: status }, { headers: NO_STORE });
}
