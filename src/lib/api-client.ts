import type { ApiErrorBody, ErrorCode, FieldErrors } from "./errors";

export class ApiClientError extends Error {
  constructor(
    readonly code: ErrorCode | "network",
    message: string,
    readonly status: number,
    readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

type Options = { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown; signal?: AbortSignal };

/**
 * Typed fetch for /api/v1 routes. Always sends JSON, so cross-site form posts can never reach
 * mutation endpoints, and maps `{ error }` bodies to ApiClientError.
 */
export async function api<T>(path: string, { method = "GET", body, signal }: Options = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      signal,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiClientError("network", "You appear to be offline. Check your connection and try again.", 0);
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!response.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    const message =
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : (err?.message ?? (response.status >= 500 ? "The service is temporarily unavailable. Please try again." : "Request failed."));
    throw new ApiClientError(err?.code ?? (response.status === 401 ? "unauthenticated" : "internal"), message, response.status, err?.fieldErrors);
  }
  return (json as { data: T }).data;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Something went wrong. Please try again.";
}
