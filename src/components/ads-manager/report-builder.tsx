"use client";

import { CalendarClock, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { Alert, Badge, Card, Spinner } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { MetricsTable, ReportFilters, TABLE_COLUMNS, useReport, type ReportQuery } from "./analytics-view";
import { presetRange, type RangePreset } from "./model";

const DEFAULT_COLUMNS = new Set(["impressions", "clicks", "ctr", "spendMinor", "conversions", "cpaMinor"]);

export function ReportBuilder({ accountId, campaigns }: { accountId: string; campaigns: { id: string; name: string }[] }) {
  const [q, setQ] = useState<ReportQuery & { preset: RangePreset | "custom" }>(() => ({ preset: "30d", ...presetRange("30d"), group: "campaign", campaignId: "", compare: false }));
  const [cols, setCols] = useState<Set<string>>(DEFAULT_COLUMNS);
  const { report, loading, error, qs } = useReport(accountId, q);
  const columns = TABLE_COLUMNS.filter((c) => cols.has(c.key));

  return (
    <div className="space-y-6">
      <Card className="space-y-5 p-5">
        <h2 className="font-medium">Build a report</h2>
        <ReportFilters q={q} onChange={setQ} campaigns={campaigns} />
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Columns</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TABLE_COLUMNS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cols.has(c.key)}
                  onChange={() =>
                    setCols((s) => {
                      const n = new Set(s);
                      if (n.has(c.key)) n.delete(c.key);
                      else n.add(c.key);
                      return n.size ? n : s;
                    })
                  }
                />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href={`/api/v1/ads-manager/analytics/export?${qs}`} download>
              <Download /> Download CSV
            </a>
          </Button>
          <p className="text-xs text-muted">The CSV includes every metric for the rows below. Spreadsheet formulas in names are neutralised.</p>
        </div>
      </Card>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {!report && loading ? (
        <div className="flex justify-center py-12">
          <Spinner label="Loading report" />
        </div>
      ) : null}
      {report ? (
        <Card className={cn("p-2 transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          {report.rows.length ? <MetricsTable report={report} group={q.group} columns={columns} /> : <p className="p-6 text-center text-sm text-muted">No delivery in this period.</p>}
        </Card>
      ) : null}

      <Card className="flex flex-wrap items-start gap-4 p-5">
        <CalendarClock className="mt-0.5 size-5 text-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-2 font-medium">
            Scheduled reports <Badge>Coming soon</Badge>
          </p>
          <p className="text-sm text-muted">Automatic weekly or monthly email reports aren&apos;t available yet. Download a CSV whenever you need one.</p>
        </div>
      </Card>
    </div>
  );
}
