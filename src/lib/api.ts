import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = "BAD_REQUEST") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error.message,
          code: error.code,
        },
      },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : "服务器内部错误";

  return NextResponse.json(
    {
      ok: false,
      error: {
        message,
        code: "INTERNAL_SERVER_ERROR",
      },
    },
    { status: 500 },
  );
}

