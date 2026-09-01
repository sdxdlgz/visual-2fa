import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) {
    throw new ApiError(403, "CROSS_ORIGIN_REJECTED", "请求来源不受信任");
  }
  if (!origin) {
    throw new ApiError(403, "ORIGIN_REQUIRED", "缺少请求来源");
  }

  const expected = process.env.APP_ORIGIN;
  if (expected) {
    if (new URL(origin).origin !== new URL(expected).origin) {
      throw new ApiError(403, "CROSS_ORIGIN_REJECTED", "请求来源不受信任");
    }
    return;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host || new URL(origin).host !== host) {
    throw new ApiError(403, "CROSS_ORIGIN_REJECTED", "请求来源不受信任");
  }
}

export function json(data: unknown, init?: ResponseInit): NextResponse {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "INVALID_INPUT",
          message: error.issues[0]?.message || "输入格式不正确",
          fields: error.flatten().fieldErrors,
        },
      },
      { status: 400 },
    );
  }
  console.error("API request failed", error instanceof Error ? error.message : "unknown error");
  return json({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } }, { status: 500 });
}
