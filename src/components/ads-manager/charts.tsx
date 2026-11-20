"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";
import { compactNumber, formatMetric, minorToMajor, niceStep, periodDelta, type ChartMetric } from "./model";

/*
 * Charts follow the dataviz method: one series per chart in the accent token (contrast checked
 * against both surfaces), 2px line with a ~10% wash, hairline solid grid, crosshair + tooltip on
 * hover and keyboard focus, and a table view so no value is reachable only by hovering.
 */

const shortDate = (iso: string) => new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

export function TimeSeriesChart({
  title,
  points,
  format,
  formatTick = format,
  height = 240,
}: {
  title: string;
  points: { date: string; value: number }[];
  format: (v: number) => string;
  formatTick?: (v: number) => string;
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  const tableId = useId();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.max(280, Math.floor(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 12, right: 16, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(0, ...points.map((p) => p.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const x = (i: number) => pad.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const area = points.length > 1 ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : "";
  const labelIdx = points.length <= 1 ? [0] : [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  function onMove(e: PointerEvent<SVGSVGElement>) {
    if (!points.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const i = points.length <= 1 ? 0 : Math.round(((px - pad.left) / innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (!points.length) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((a) => {
        const cur = a ?? (e.key === "ArrowRight" ? -1 : points.length);
        return Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
      });
    } else if (e.key === "Escape") setActive(null);
  }

  const activePoint = active !== null ? points[active] : undefined;
  const last = points.at(-1);

  return (
    <figure className="space-y-2">
      <div ref={wrap} className="relative w-full">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${title}. Use the arrow keys to read values; a table follows.`}
          aria-describedby={tableId}
          tabIndex={0}
          className="block touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--muted)] text-[11px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) =>
            points[i] ? (
              <text
                key={i}
                x={x(i)}
                y={height - 8}
                textAnchor={points.length <= 1 ? "middle" : i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                className="fill-[var(--muted)] text-[11px]"
              >
                {shortDate(points[i]!.date)}
              </text>
            ) : null,
          )}
          {area ? <path d={area} fill="var(--accent)" fillOpacity={0.1} /> : null}
          {points.length > 1 ? <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
          {last ? <circle cx={x(points.length - 1)} cy={y(last.value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} /> : null}
          {activePoint && active !== null ? (
            <g aria-hidden="true">
              <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
              <circle cx={x(active)} cy={y(activePoint.value)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
        {activePoint && active !== null ? (
          <div
            role="status"
            className="pointer-events-none absolute top-1 z-10 min-w-28 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(active) - 56, 0), width - 128) }}
          >
            <p className="text-sm font-semibold tabular-nums">{format(activePoint.value)}</p>
            <p className="text-muted">{shortDate(activePoint.date)}</p>
          </div>
        ) : null}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">View as table</summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table id={tableId} className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="text-left text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 font-medium">Date</th>
                <th scope="col" className="py-1 text-right font-medium">Value</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {points.map((p) => (
                <tr key={p.date} className="border-t border-border">
                  <td className="py-1">{shortDate(p.date)}</td>
                  <td className="py-1 text-right">{format(p.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Server-friendly wrapper: picks the formatter from the metric so pages can pass plain data. */
export function MetricChart({ title, points, metric, currency }: { title: string; points: { date: string; value: number }[]; metric: ChartMetric; currency: string }) {
  const format = (v: number) => formatMetric(metric, v, currency);
  const tick = (v: number) =>
    metric === "spendMinor" || metric === "cpcMinor"
      ? new Intl.NumberFormat("en", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(minorToMajor(v, currency))
      : metric === "ctr"
        ? `${(v * 100).toFixed(1)}%`
        : compactNumber(v);
  return <TimeSeriesChart title={title} points={points} format={format} formatTick={tick} />;
}

/** Ranked bars with money values, for server pages. */
export function MoneyBarList({ title, items, currency }: { title: string; items: { key: string; label: string; value: number; href?: string }[]; currency: string }) {
  return <BarList title={title} items={items} format={(v) => formatMetric("spendMinor", v, currency)} />;
}

/** Ranked horizontal bars (one series). Values are printed at the bar tips. */
export function BarList({ title, items, format }: { title: string; items: { key: string; label: string; value: number; href?: string }[]; format: (v: number) => string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  return (
    <ul aria-label={title} className="space-y-3">
      {items.map((i) => (
        <li key={i.key} className="space-y-1" title={`${i.label}: ${format(i.value)}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            {i.href ? (
              <a href={i.href} className="truncate hover:text-accent">
                {i.label}
              </a>
            ) : (
              <span className="truncate">{i.label}</span>
            )}
            <span className="shrink-0 font-medium tabular-nums">{format(i.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-2 rounded-full bg-accent" style={{ width: `${max > 0 ? Math.max(1.5, (i.value / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Stat tile: label · value · signed delta vs the previous period, coloured by whether up is good. */
export function StatTile({
  label,
  value,
  current,
  previous,
  upIsGood = true,
  hint,
}: {
  label: string;
  value: string;
  current?: number | null;
  previous?: number | null;
  upIsGood?: boolean;
  hint?: string;
}) {
  const d = periodDelta(current ?? null, previous ?? null);
  const good = d && d.direction !== "flat" ? (d.direction === "up") === upIsGood : null;
  const Icon = !d || d.direction === "flat" ? Minus : d.direction === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="panel p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {d ? (
        <p className={cn("mt-1 inline-flex items-center gap-1 text-xs", good === null ? "text-muted" : good ? "text-success" : "text-danger")}>
          <Icon className="size-3.5" aria-hidden="true" />
          {d.direction === "flat" ? "No change" : `${d.ratio > 0 ? "+" : ""}${(d.ratio * 100).toFixed(1)}%`}
          <span className="text-muted">vs previous period</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">{hint ?? (previous === undefined ? " " : "No previous-period data")}</p>
      )}
    </div>
  );
}
