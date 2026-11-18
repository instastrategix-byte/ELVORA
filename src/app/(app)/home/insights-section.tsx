import { Widget, WidgetError } from "@/components/dashboard/widgets";
import { attempt } from "@/lib/attempt";
import { profileInsights } from "@backend/modules/insights/service";
import { requirePageSession } from "@backend/auth/viewer";

const DAY = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * Profile views over 30 days: a hero number plus a single-series sparkline. Aggregates only —
 * members never see who viewed them. Days without views render as zero, never interpolated.
 */
export async function ProfileInsightsSection() {
  const { db } = await requirePageSession({ next: "/home" });
  const result = await attempt(() => profileInsights(db, 30));
  if (!result.ok) {
    return (
      <Widget title="Profile views">
        <WidgetError what="profile insights" />
      </Widget>
    );
  }
  const { days, total, last7, previous7 } = result.data;
  const max = Math.max(1, ...days.map((d) => d.views));
  const change = last7 - previous7;

  return (
    <Widget title="Profile views">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="display text-3xl tabular-nums">{total}</p>
          <p className="text-xs text-muted">in the last 30 days</p>
        </div>
        <p className="text-right text-xs text-muted">
          <span className="font-medium text-fg tabular-nums">{last7}</span> this week
          <br />
          {change === 0 ? "same as last week" : `${change > 0 ? "+" : "−"}${Math.abs(change)} vs last week`}
        </p>
      </div>

      {total === 0 ? (
        <p className="mt-4 text-xs text-muted">No views yet. A complete profile with a photo and headline is far more likely to be discovered.</p>
      ) : (
        <div className="mt-4 flex h-14 items-end gap-[2px]" aria-hidden="true">
          {days.map((d) => (
            // Each column is the hit target (full height); the bar inside is the mark.
            <span key={d.day} className="group relative flex h-full flex-1 items-end" title={`${DAY.format(new Date(d.day))}: ${d.views} ${d.views === 1 ? "view" : "views"}`}>
              <span
                className="block w-full rounded-t-[4px] bg-accent/45 transition-colors group-hover:bg-accent"
                style={{ height: d.views === 0 ? "2px" : `${Math.max(8, (d.views / max) * 100)}%`, opacity: d.views === 0 ? 0.35 : undefined }}
              />
            </span>
          ))}
        </div>
      )}

      <table className="sr-only">
        <caption>Daily profile views, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Views</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <td>{DAY.format(new Date(d.day))}</td>
              <td>{d.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-muted">Private to you. ELVORA never shows who viewed your profile.</p>
    </Widget>
  );
}
