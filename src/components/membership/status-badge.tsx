import { Badge } from "@/components/ui/primitives";
import { titleCase } from "@/lib/format";

const TONES: Record<string, "neutral" | "accent" | "success" | "warning" | "danger"> = {
  submitted: "warning",
  under_review: "warning",
  pending: "warning",
  pending_review: "warning",
  approved: "success",
  active: "success",
  trialing: "success",
  published: "success",
  paid: "success",
  rejected: "danger",
  revoked: "danger",
  failed: "danger",
  suspended: "danger",
  removed: "danger",
  past_due: "danger",
  unpaid: "danger",
  withdrawn: "neutral",
  canceled: "neutral",
  expired: "neutral",
  draft: "neutral",
  archived: "neutral",
  paused: "neutral",
  completed: "neutral",
  incomplete: "warning",
  refunded: "neutral",
  new: "accent",
  responded: "success",
  closed: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={TONES[status] ?? "neutral"}>{label ?? titleCase(status)}</Badge>;
}
