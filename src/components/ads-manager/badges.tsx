import { Badge } from "@/components/ui/primitives";
import type { CampaignStatus, EntityStatus, ReviewStatus } from "@backend/modules/advertising/types";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const CAMPAIGN: Record<CampaignStatus, [string, Tone]> = {
  draft: ["Draft", "neutral"],
  pending_review: ["In review", "warning"],
  active: ["Active", "success"],
  paused: ["Paused", "neutral"],
  completed: ["Completed", "neutral"],
  rejected: ["Not approved", "danger"],
};

const REVIEW: Record<ReviewStatus, [string, Tone]> = {
  draft: ["Not submitted", "neutral"],
  pending: ["In review", "warning"],
  approved: ["Approved", "success"],
  rejected: ["Not approved", "danger"],
  changes_requested: ["Changes requested", "warning"],
};

const ENTITY: Record<EntityStatus, [string, Tone]> = {
  draft: ["Draft", "neutral"],
  active: ["On", "success"],
  paused: ["Paused", "neutral"],
  archived: ["Archived", "neutral"],
};

export function CampaignStatusBadge({ status, archived, suspended }: { status: CampaignStatus; archived?: boolean; suspended?: boolean }) {
  if (suspended) return <Badge tone="danger">Suspended</Badge>;
  if (archived) return <Badge>Archived</Badge>;
  const [label, tone] = CAMPAIGN[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const [label, tone] = REVIEW[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function EntityBadge({ status }: { status: EntityStatus }) {
  const [label, tone] = ENTITY[status];
  return <Badge tone={tone}>{label}</Badge>;
}
