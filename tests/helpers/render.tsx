import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";
import { Toaster } from "@/components/ui/toast";

export const routerMock = { push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };

export function renderWithProviders(ui: ReactElement) {
  return render(<Toaster>{ui}</Toaster>);
}

type MockResponse = { status?: number; body: unknown };

/** Queues JSON responses for successive fetch calls and records requests. */
export function mockFetch(...responses: MockResponse[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: { data: null } };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}
