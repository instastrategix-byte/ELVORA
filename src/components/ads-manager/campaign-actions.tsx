"use client";

import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { CAMPAIGN_ACTION_LABELS, type CampaignAction } from "./model";

const DONE: Record<CampaignAction, string> = {
  submit: "Submitted for review",
  pause: "Campaign paused",
  resume: "Campaign resumed",
  archive: "Campaign archived",
  unarchive: "Campaign restored",
  duplicate: "Copy created as a draft",
};

/** Row/detail actions. The list of actions comes from `campaignActionsFor`; SQL re-checks each one. */
export function CampaignActions({
  accountId,
  campaignId,
  actions,
  variant = "menu",
}: {
  accountId: string;
  campaignId: string;
  actions: CampaignAction[];
  variant?: "menu" | "buttons";
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(a: CampaignAction) {
    if (pending) return;
    if (a === "archive" && !window.confirm("Archive this campaign? It stops serving and moves to the archive.")) return;
    setPending(true);
    setError(null);
    try {
      const result = await api<{ id: string }>(`/api/v1/ads-manager/campaigns/${campaignId}/actions`, { method: "POST", body: { action: a } });
      toast.show(DONE[a]);
      if (a === "duplicate") router.push(`/ads-manager/${accountId}/campaigns/new?campaign=${result.id}`);
      else router.refresh();
    } catch (e) {
      const message = errorMessage(e);
      setError(message);
      toast.show(message, "error");
    } finally {
      setPending(false);
    }
  }

  if (!actions.length) return null;
  if (variant === "buttons") {
    return (
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button key={a} variant={a === "submit" ? "primary" : "secondary"} size="sm" disabled={pending} onClick={() => run(a)}>
            {CAMPAIGN_ACTION_LABELS[a]}
          </Button>
        ))}
        {error ? (
          <p role="alert" className="w-full text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Campaign actions" disabled={pending}>
          <MoreHorizontal />
        </Button>
      </MenuTrigger>
      <MenuContent>
        {actions.map((a) => (
          <MenuItem key={a} onSelect={() => void run(a)}>
            {CAMPAIGN_ACTION_LABELS[a]}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
