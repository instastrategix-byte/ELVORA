// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, localDateIso } from "@/lib/format";
import { LocalTime } from "./local-time";

describe("date formatting", () => {
  it("shows calendar dates exactly as written, whatever the time zone", () => {
    expect(formatDate("2026-11-20")).toBe("Nov 20, 2026");
    expect(formatDate("2026-11-20", "America/Los_Angeles")).toBe("Nov 20, 2026");
    expect(formatDate("2026-01-01", "Pacific/Kiritimati")).toBe("Jan 1, 2026");
  });

  it("formats timestamps in the requested zone", () => {
    const iso = "2026-11-20T20:30:00Z";
    expect(formatDate(iso, "UTC")).toBe("Nov 20, 2026");
    expect(formatDate(iso, "Asia/Kolkata")).toBe("Nov 21, 2026");
    expect(formatDateTime(iso, "Asia/Kolkata")).toMatch(/Nov 21.*02:00/);
  });

  it("gives the local calendar date, not the UTC one", () => {
    expect(localDateIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("LocalTime", () => {
  it("renders UTC on the server so hydration matches, with a machine-readable datetime", () => {
    const html = renderToString(<LocalTime iso="2026-11-20T20:30:00Z" />);
    expect(html).toContain('dateTime="2026-11-20T20:30:00Z"');
    expect(html).toContain(formatDateTime("2026-11-20T20:30:00Z", "UTC"));
  });

  it("switches to the viewer's own zone in the browser", () => {
    render(<LocalTime iso="2026-11-20T20:30:00Z" format="date" />);
    expect(screen.getByText(formatDate("2026-11-20T20:30:00Z"))).toBeInTheDocument();
  });
});
