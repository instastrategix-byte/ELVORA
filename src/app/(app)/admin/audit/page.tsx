import { ServiceNotice } from "@/components/feedback/service-notice";
import { Card, EmptyState } from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/format";
import { auditLog } from "@backend/modules/admin/service";
import { requirePageSession } from "@backend/auth/viewer";

export default async function AuditPage() {
  const { db } = await requirePageSession({ staff: "moderator", next: "/admin/audit" });
  let rows;
  try {
    rows = await auditLog(db);
  } catch (error) {
    return <ServiceNotice error={error} what="the audit log" />;
  }
  if (!rows.length) return <EmptyState title="No audit events yet" />;
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Latest 100 administrative actions</caption>
        <thead className="text-left text-xs text-muted">
          <tr className="border-b border-border">
            <th scope="col" className="p-4 font-medium">When</th>
            <th scope="col" className="p-4 font-medium">Actor</th>
            <th scope="col" className="p-4 font-medium">Action</th>
            <th scope="col" className="p-4 font-medium">Entity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="p-4 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
              <td className="p-4">{r.actor?.displayName ?? "System"}</td>
              <td className="p-4 font-mono text-xs">{r.action}</td>
              <td className="p-4 font-mono text-xs text-muted">
                {r.entityType}
                {r.entityId ? `:${r.entityId.slice(0, 8)}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
