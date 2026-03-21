import type { NextRequest } from "next/server";
import type { z } from "zod";
import { ApiError } from "@/lib/api";

export async function parseJsonBody<TSchema extends z.ZodTypeAny>(
  request: NextRequest,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new ApiError(400, "请求体不是合法 JSON", "INVALID_JSON");
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(400, parsed.error.issues[0]?.message ?? "参数错误", "INVALID_PAYLOAD");
  }

  return parsed.data;
}

