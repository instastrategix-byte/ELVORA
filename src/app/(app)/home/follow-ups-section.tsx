import Link from "next/link";
import { Widget } from "@/components/dashboard/widgets";
import { Avatar } from "@/components/ui/primitives";
import { attempt } from "@/lib/attempt";
import { formatDate } from "@/lib/format";
import { dueReminders } from "@backend/modules/contacts/service";
import { requirePageSession } from "@backend/auth/viewer";

/** Follow-ups from the relationship manager that are due today or overdue. Hidden when none. */
export async function FollowUpsSection() {
  const { db } = await requirePageSession({ next: "/home" });
  const result = await attempt(() => dueReminders(db, 4));
  if (!result.ok || result.data.length === 0) return null;
  return (
    <Widget title="Follow-ups due" href="/contacts?due=1" hrefLabel="All contacts">
      <ul className="space-y-3">
        {result.data.map((r) => (
          <li key={r.id} className="flex items-start gap-3">
            <Avatar src={r.person.avatarUrl} name={r.person.displayName} size={32} />
            <div className="min-w-0 text-sm">
              <Link href={`/members/${r.person.handle}`} className="font-medium hover:text-accent">
                {r.person.displayName}
              </Link>
              <p className="truncate text-muted">{r.body}</p>
              <p className="text-xs text-muted">Due {formatDate(r.dueOn)}</p>
            </div>
          </li>
        ))}
      </ul>
    </Widget>
  );
}
