import "server-only";
import { AppError } from "@/lib/errors";

type PgLikeError = { code?: string; message?: string; details?: string | null; hint?: string | null };

/**
 * Maps PostgREST/Postgres errors to AppErrors. Messages raised deliberately by our SQL
 * functions (SQLSTATE P0001 / 42501) are written for end users and are passed through;
 * anything else is replaced with a generic message so internals never leak.
 */
export function toAppError(error: PgLikeError, fallback = "The request could not be completed."): AppError {
  const message = error.message ?? fallback;
  switch (error.code) {
    case "P0001":
      return new AppError("business_rule", capitalize(message));
    case "42501":
      return new AppError("forbidden", /permission denied|row-level security/i.test(message) ? "You are not allowed to do that." : capitalize(message));
    // Raised deliberately by our SQL functions with user-facing messages.
    case "P0002":
      return new AppError("not_found", capitalize(message));
    case "22023":
      return new AppError("validation_failed", capitalize(message));
    case "23505":
      return new AppError("conflict", "That already exists.");
    case "23503":
      return new AppError("not_found", "A referenced record no longer exists.");
    case "23514":
    case "22P02":
    case "22001":
      return new AppError("validation_failed", "Some values are not valid.");
    case "PGRST116":
      return new AppError("not_found", "Not found.");
    default:
      return new AppError("internal", fallback);
  }
}

type SuccessData<R> = R extends { error: null; data: infer D } ? D : never;

/**
 * Unwraps a Supabase response (a success/failure union) to the success data, or throws a
 * mapped AppError.
 */
export function unwrap<R extends { data: unknown; error: PgLikeError | null }>(result: R, fallback?: string): SuccessData<R> {
  if (result.error) throw toAppError(result.error, fallback);
  return result.data as SuccessData<R>;
}

export function throwIfError(error: PgLikeError | null, fallback?: string): void {
  if (error) throw toAppError(error, fallback);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
