"use client";

import { useCallback, useRef, useState } from "react";
import { ApiClientError, errorMessage } from "./api-client";
import type { FieldErrors } from "./errors";

type State = { pending: boolean; error: string | null; fieldErrors: FieldErrors };

/**
 * Runs an async mutation with pending/error state. Ignores double-submits while pending.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [state, setState] = useState<State>({ pending: false, error: null, fieldErrors: {} });
  const inFlight = useRef(false);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setState({ pending: true, error: null, fieldErrors: {} });
      try {
        const result = await fn(...args);
        setState({ pending: false, error: null, fieldErrors: {} });
        return result;
      } catch (error) {
        setState({
          pending: false,
          error: errorMessage(error),
          fieldErrors: error instanceof ApiClientError ? (error.fieldErrors ?? {}) : {},
        });
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [fn],
  );

  const setErrors = useCallback((fieldErrors: FieldErrors, error: string | null = null) => {
    setState((s) => ({ ...s, fieldErrors, error }));
  }, []);

  return { ...state, run, setErrors };
}

/** Converts a Zod flattened error into FieldErrors. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
