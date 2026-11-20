import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { AppError, isAppError, type ApiErrorBody } from "@/lib/errors";
import { logger } from "@backend/core/logger";
import { getSession, requireApiSession, type Session } from "@backend/auth/viewer";
import type { Feature, StaffRole } from "@backend/modules/auth/permissions";
import { createClient, type DbClient } from "@backend/db/server";
import { rateLimit } from "./rate-limit";

type AuthMode = "public" | "user" | "member";

type RouteOptions<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType> = {
  /** public: no session needed; user: signed in; member: signed in + onboarded (default). */
  auth?: AuthMode;
  staff?: StaffRole;
  feature?: Feature;
  params?: P;
  query?: Q;
  body?: B;
  /** Max JSON body size in bytes (default 64 KiB). */
  maxBodyBytes?: number;
  /** Requests per minute per user (or IP for public routes). */
  rateLimitPerMinute?: number;
  name: string;
};

type HandlerContext<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, A extends AuthMode> = {
  request: Request;
  params: z.infer<P>;
  query: z.infer<Q>;
  body: z.infer<B>;
  session: A extends "public" ? Session | null : Session;
};

const empty = z.object({}).passthrough();

/** Database client for public routes: the session's client, or an anonymous (RLS `anon`) one. */
export async function dbFor(session: Session | null): Promise<DbClient> {
  return session?.db ?? createClient();
}

export function jsonError(error: AppError, headers?: HeadersInit): Response {
  const body: ApiErrorBody = { error: { code: error.code, message: error.message, fieldErrors: error.fieldErrors } };
  return Response.json(body, { status: error.status, headers });
}

/**
 * Wraps a route handler with: same-origin enforcement for mutations (CSRF), auth,
 * Zod validation of params/query/body, body-size limits, rate limiting, and uniform
 * `{ data }` / `{ error }` responses.
 */
export function route<
  P extends z.ZodType = typeof empty,
  Q extends z.ZodType = typeof empty,
  B extends z.ZodType = typeof empty,
  A extends AuthMode = "member",
  T = unknown,
>(
  options: RouteOptions<P, Q, B> & { auth?: A },
  handler: (ctx: HandlerContext<P, Q, B, A>) => Promise<T | Response>,
) {
  return async (
    request: Request,
    context: { params?: Promise<Record<string, string | string[]> | undefined> },
  ): Promise<Response> => {
    const started = Date.now();
    try {
      const method = request.method.toUpperCase();
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(method);
      if (mutating) assertSameOrigin(request);

      const auth = options.auth ?? "member";
      let session: Session | null = null;
      if (auth === "public") {
        session = await getSession().catch(() => null);
      } else {
        session = await requireApiSession({
          onboarded: auth === "member",
          staff: options.staff,
          feature: options.feature,
        });
      }

      if (options.rateLimitPerMinute) {
        const who = session?.viewer.id ?? clientIp(request);
        const rl = rateLimit(`${options.name}:${who}`, options.rateLimitPerMinute, 60_000);
        if (!rl.ok) {
          return jsonError(new AppError("rate_limited", "Too many requests. Please slow down."), {
            "Retry-After": String(rl.retryAfterSec),
          });
        }
      }

      // Routes without dynamic segments receive no params object.
      const params = parse(options.params ?? empty, (await context?.params) ?? {}, "Invalid path.");
      const url = new URL(request.url);
      const query = parse(options.query ?? empty, Object.fromEntries(url.searchParams), "Invalid query.");
      let body: unknown = {};
      if (options.body) body = parse(options.body, await readJson(request, options.maxBodyBytes ?? 65_536), "Invalid request.");

      const result = await handler({
        request,
        params,
        query,
        body,
        session: session as HandlerContext<P, Q, B, A>["session"],
      } as HandlerContext<P, Q, B, A>);
      if (result instanceof Response) return result;
      return Response.json({ data: result ?? null }, { status: method === "POST" ? 201 : 200 });
    } catch (error) {
      // Let Next.js control-flow signals (prerender bail-out, redirect, notFound) propagate.
      unstable_rethrow(error);
      if (isAppError(error)) {
        if (error.status >= 500) logger.error("api.error", { route: options.name, code: error.code });
        return jsonError(error);
      }
      logger.error("api.unhandled", { route: options.name, error, ms: Date.now() - started });
      return jsonError(new AppError("internal", "Something went wrong. Please try again."));
    }
  };
}

function parse<S extends z.ZodType>(schema: S, input: unknown, message: string): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("validation_failed", message, z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new AppError("bad_request", "Expected a JSON request body.");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > maxBytes) throw new AppError("payload_too_large", "Request body is too large.");
  const text = await request.text();
  if (text.length > maxBytes) throw new AppError("payload_too_large", "Request body is too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new AppError("bad_request", "Malformed JSON.");
  }
}

/**
 * Cookie-authenticated mutations must come from our own origin. Browsers always send
 * `Origin` on cross-site POST/PATCH/DELETE, so a mismatch indicates CSRF.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) {
    // Older browsers and server-to-server calls send no Origin. Browsers that send Fetch
    // Metadata still tell us when a request came from another site.
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new AppError("forbidden", "Cross-site request rejected.");
    return;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("forbidden", "Invalid origin.");
  }
  if (!host || originHost !== host) throw new AppError("forbidden", "Cross-site request rejected.");
}

/** Platform-set client IP first (Vercel sets x-real-ip; a client-sent X-Forwarded-For prefix can be spoofed elsewhere). */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}
