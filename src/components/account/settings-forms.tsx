"use client";

import { Switch } from "radix-ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api-client";
import { useAction } from "@/lib/use-action";

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-6 w-11 shrink-0 rounded-full bg-border transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[22px] data-[state=checked]:bg-accent-fg" />
      </Switch.Root>
    </div>
  );
}

export function PrivacyForm({
  initial,
}: {
  initial: {
    profileVisibility: "public" | "members" | "connections";
    discoverable: boolean;
    messagingPolicy: "connections" | "members" | "nobody";
    showReadReceipts: boolean;
  };
}) {
  const [values, setValues] = useState(initial);
  const action = useAction((body: unknown) => api("/api/v1/profile/privacy", { method: "PUT", body }));
  const toast = useToast();
  const router = useRouter();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if ((await action.run(values)) !== undefined) {
      toast.show("Privacy settings saved");
      router.refresh();
    }
  }
  return (
    <Card className="p-6">
      <form onSubmit={save} className="space-y-5">
        <h2 className="display text-2xl">Privacy</h2>
        {action.error ? <Alert tone="error">{action.error}</Alert> : null}
        <Field id="pv" label="Who can see your profile" hint="Your name and photo may still appear to people you message or connect with.">
          {(a) => (
            <Select value={values.profileVisibility} onChange={(e) => setValues({ ...values, profileVisibility: e.target.value as typeof values.profileVisibility })} {...a}>
              <option value="public">Everyone, including guests</option>
              <option value="members">ELVORA members</option>
              <option value="connections">Only my connections</option>
            </Select>
          )}
        </Field>
        <Field id="mp" label="Who can message you">
          {(a) => (
            <Select value={values.messagingPolicy} onChange={(e) => setValues({ ...values, messagingPolicy: e.target.value as typeof values.messagingPolicy })} {...a}>
              <option value="connections">Only my connections</option>
              <option value="members">Any ELVORA member</option>
              <option value="nobody">No one</option>
            </Select>
          )}
        </Field>
        <Toggle
          id="disc"
          label="Appear in Discover"
          description="When off, people can still reach your profile by its link, subject to the visibility above."
          checked={values.discoverable}
          onChange={(v) => setValues({ ...values, discoverable: v })}
        />
        <Toggle
          id="receipts"
          label="Read receipts"
          description="Let people see when you've read their messages. This works both ways: if you turn it off, you won't see when others have read yours either."
          checked={values.showReadReceipts}
          onChange={(v) => setValues({ ...values, showReadReceipts: v })}
        />
        <Button type="submit" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save privacy settings"}
        </Button>
      </form>
    </Card>
  );
}

type Prefs = { connectionActivity: boolean; postActivity: boolean; messages: boolean; marketplace: boolean; emailEnabled: boolean };

export function NotificationPrefsForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState(initial);
  const action = useAction((body: unknown) => api("/api/v1/notification-preferences", { method: "PUT", body }));
  const toast = useToast();
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if ((await action.run(prefs)) !== undefined) toast.show("Notification preferences saved");
  }
  const set = (k: keyof Prefs) => (v: boolean) => setPrefs({ ...prefs, [k]: v });
  return (
    <Card className="p-6">
      <form onSubmit={save}>
        <h2 className="display text-2xl">Notifications</h2>
        <p className="mt-1 text-sm text-muted">Membership, verification and safety notices are always delivered.</p>
        {action.error ? <Alert tone="error" className="mt-4">{action.error}</Alert> : null}
        <div className="mt-2 divide-y divide-border">
          <Toggle id="n-conn" label="Connections & followers" checked={prefs.connectionActivity} onChange={set("connectionActivity")} />
          <Toggle id="n-post" label="Likes and comments on your posts" checked={prefs.postActivity} onChange={set("postActivity")} />
          <Toggle id="n-msg" label="New messages" checked={prefs.messages} onChange={set("messages")} />
          <Toggle id="n-mkt" label="Marketplace inquiries" checked={prefs.marketplace} onChange={set("marketplace")} />
          <Toggle id="n-email" label="Email me important updates" checked={prefs.emailEnabled} onChange={set("emailEnabled")} />
        </div>
        <Button type="submit" className="mt-4" disabled={action.pending}>
          {action.pending ? "Saving…" : "Save notification settings"}
        </Button>
      </form>
    </Card>
  );
}

export function SignOutOthersButton() {
  const action = useAction(() => api("/api/v1/account/sessions", { method: "DELETE" }));
  const toast = useToast();
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={action.pending}
        onClick={async () => {
          if ((await action.run()) !== undefined) toast.show("Signed out of all other sessions");
        }}
      >
        {action.pending ? "Signing out…" : "Sign out other sessions"}
      </Button>
      {action.error ? <p className="text-xs text-danger">{action.error}</p> : null}
    </div>
  );
}

export function DeletionRequest({ pending }: { pending: boolean }) {
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");
  const request = useAction((body: unknown) => api("/api/v1/account/deletion", { method: "POST", body }));
  const cancel = useAction(() => api("/api/v1/account/deletion", { method: "DELETE" }));
  const router = useRouter();
  const toast = useToast();

  if (pending) {
    return (
      <Alert
        tone="warning"
        title="Deletion requested"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={cancel.pending}
            onClick={async () => {
              if ((await cancel.run()) !== undefined) {
                toast.show("Deletion request cancelled");
                router.refresh();
              }
            }}
          >
            Cancel request
          </Button>
        }
      >
        Your account is scheduled for deletion. Active memberships should be cancelled separately to stop renewals.
      </Alert>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if ((await request.run({ confirm, reason: reason || undefined })) !== undefined) {
          toast.show("Deletion request received");
          router.refresh();
        }
      }}
    >
      {request.error ? <Alert tone="error">{request.error}</Alert> : null}
      <Field id="del-reason" label="Reason (optional)">
        {(a) => <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} className="min-h-20" {...a} />}
      </Field>
      <Field id="del-confirm" label='Type "DELETE" to confirm'>
        {(a) => <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" {...a} />}
      </Field>
      <Button type="submit" variant="danger" disabled={confirm !== "DELETE" || request.pending}>
        {request.pending ? "Submitting…" : "Request account deletion"}
      </Button>
    </form>
  );
}
