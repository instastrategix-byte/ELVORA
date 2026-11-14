import { unstable_rethrow } from "next/navigation";

export type Attempt<T> = { ok: true; data: T } | { ok: false; error: unknown };

/**
 * Runs a data load and captures failures as a value, so pages can render an error state without
 * constructing JSX inside try/catch. Next.js control-flow errors (redirect, notFound) are rethrown.
 */
export async function attempt<T>(load: () => Promise<T>): Promise<Attempt<T>> {
  try {
    return { ok: true, data: await load() };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, error };
  }
}
