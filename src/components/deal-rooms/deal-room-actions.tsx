"use client";

import { FileUp, LogOut, Plus, Send, Settings2, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Avatar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, ApiClientError, errorMessage } from "@/lib/api-client";
import { publicEnv } from "@/lib/env";
import { useAction, zodFieldErrors } from "@/lib/use-action";
import { checkDealRoomFile, DEAL_ROOM_ACCEPT, DEAL_ROOM_ROLE_LABELS, type DealRoomRole } from "@backend/modules/deal-rooms/constants";
import type { ProfileSummary } from "@backend/modules/profiles/types";

type RoomFields = { name: string; description: string | null; ndaRequired: boolean; ndaText: string | null };

function RoomForm({ initial, submitLabel, onSubmit }: { initial?: RoomFields; submitLabel: string; onSubmit: (body: RoomFields) => Promise<unknown> }) {
  const action = useAction(onSubmit);
  const [nda, setNda] = useState(initial?.ndaRequired ?? false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: RoomFields = {
      name: String(f.get("name") ?? "").trim(),
      description: String(f.get("description") ?? "").trim() || null,
      ndaRequired: nda,
      ndaText: nda ? String(f.get("ndaText") ?? "").trim() : null,
    };
    const errors: Record<string, string[]> = {};
    if (body.name.length < 3) errors.name = ["Give the room a name (3+ characters)"];
    if (nda && (body.ndaText ?? "").length < 20) errors.ndaText = ["Add the NDA terms members must accept (20+ characters)"];
    if (Object.keys(errors).length) return action.setErrors(errors);
    await action.run(body);
  }
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {action.error ? <Alert tone="error">{action.error}</Alert> : null}
      <Field id="room-name" label="Room name" required error={action.fieldErrors.name}>
        {(a) => <Input name="name" defaultValue={initial?.name} maxLength={120} placeholder="Project Atlas — Series B" {...a} />}
      </Field>
      <Field id="room-description" label="What is this room for?" error={action.fieldErrors.description}>
        {(a) => <Textarea name="description" defaultValue={initial?.description ?? ""} rows={3} maxLength={2000} {...a} />}
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={nda} onChange={(e) => setNda(e.currentTarget.checked)} />
        <span>
          <span className="font-medium">Require an NDA</span>
          <span className="block text-muted">Invitees see only the room name and these terms until they accept. Changing the terms asks everyone to accept again.</span>
        </span>
      </label>
      {nda ? (
        <Field id="room-nda" label="NDA terms" required error={action.fieldErrors.ndaText} hint="Shown in full to every invitee. Have your counsel review legal wording.">
          {(a) => <Textarea name="ndaText" defaultValue={initial?.ndaText ?? ""} rows={6} maxLength={20000} {...a} />}
        </Field>
      ) : null}
      <Button type="submit" disabled={action.pending} className="w-full sm:w-auto">
        {action.pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

export function CreateDealRoomButton() {
  const router = useRouter();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New deal room
        </Button>
      </DialogTrigger>
      <DialogContent title="New deal room" description="A private space for one deal. Only people you invite — from your connections — can enter.">
        <RoomForm
          submitLabel="Create room"
          onSubmit={async (body) => {
            const { id } = await api<{ id: string }>("/api/v1/deal-rooms", { method: "POST", body });
            router.push(`/deal-rooms/${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function RoomSettingsButton({ roomId, initial, isOwner, status }: { roomId: string; initial: RoomFields; isOwner: boolean; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const statusAction = useAction((next: string) => api(`/api/v1/deal-rooms/${roomId}/status`, { method: "POST", body: { status: next } }));
  async function setStatus(next: string) {
    if (next !== "open" && !window.confirm(next === "closed" ? "Close the room? Everything becomes read-only." : "Archive the room? It will be read-only and hidden from invitations.")) return;
    if ((await statusAction.run(next)) !== undefined) {
      toast.show(next === "open" ? "Room reopened" : next === "closed" ? "Room closed" : "Room archived");
      setOpen(false);
      router.refresh();
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Settings2 /> Settings
        </Button>
      </DialogTrigger>
      <DialogContent title="Room settings" size="lg">
        {status === "open" ? (
          <RoomForm
            initial={initial}
            submitLabel="Save changes"
            onSubmit={async (body) => {
              await api(`/api/v1/deal-rooms/${roomId}`, { method: "PATCH", body });
              toast.show("Room updated");
              setOpen(false);
              router.refresh();
            }}
          />
        ) : (
          <p className="text-sm text-muted">This room is {status}. Reopen it to make changes.</p>
        )}
        {isOwner ? (
          <div className="mt-6 space-y-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Status</p>
            {statusAction.error ? <Alert tone="error">{statusAction.error}</Alert> : null}
            <div className="flex flex-wrap gap-2">
              {status !== "open" ? (
                <Button variant="secondary" size="sm" disabled={statusAction.pending} onClick={() => setStatus("open")}>
                  Reopen
                </Button>
              ) : null}
              {status !== "closed" ? (
                <Button variant="secondary" size="sm" disabled={statusAction.pending} onClick={() => setStatus("closed")}>
                  Close (read-only)
                </Button>
              ) : null}
              {status !== "archived" ? (
                <Button variant="ghost" size="sm" disabled={statusAction.pending} onClick={() => setStatus("archived")}>
                  Archive
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function InvitationActions({ roomId, ndaRequired, ndaVersion, rejoin }: { roomId: string; ndaRequired: boolean; ndaVersion: number; rejoin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [agreed, setAgreed] = useState(!ndaRequired);
  const join = useAction(() => api(`/api/v1/deal-rooms/${roomId}/join`, { method: "POST", body: { ndaVersion: ndaRequired ? ndaVersion : null } }));
  const decline = useAction(() => api(`/api/v1/deal-rooms/${roomId}/leave`, { method: "POST" }));
  return (
    <div className="space-y-3">
      {join.error || decline.error ? <Alert tone="error">{join.error ?? decline.error}</Alert> : null}
      {ndaRequired ? (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={agreed} onChange={(e) => setAgreed(e.currentTarget.checked)} />
          <span>I have read and accept these terms (version {ndaVersion}). My acceptance is recorded with the date and the exact text.</span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!agreed || join.pending}
          onClick={async () => {
            if ((await join.run()) !== undefined) {
              toast.show(rejoin ? "Terms accepted" : "You joined the room");
              router.push(`/deal-rooms/${roomId}`);
            }
          }}
        >
          {join.pending ? "Joining…" : ndaRequired ? "Accept and enter" : "Join room"}
        </Button>
        {!rejoin ? (
          <Button
            variant="ghost"
            disabled={decline.pending}
            onClick={async () => {
              if ((await decline.run()) !== undefined) {
                toast.show("Invitation declined");
                router.refresh();
              }
            }}
          >
            Decline
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function LeaveRoomButton({ roomId }: { roomId: string }) {
  const router = useRouter();
  const leave = useAction(() => api(`/api/v1/deal-rooms/${roomId}/leave`, { method: "POST" }));
  return (
    <Button
      variant="ghost"
      disabled={leave.pending}
      title={leave.error ?? undefined}
      onClick={async () => {
        if (!window.confirm("Leave this room? You'll lose access to its documents and discussion.")) return;
        if ((await leave.run()) !== undefined) router.push("/deal-rooms");
      }}
    >
      <LogOut /> Leave
    </Button>
  );
}

export function InviteDialog({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [people, setPeople] = useState<ProfileSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Exclude<DealRoomRole, "owner">>("member");
  const invite = useAction((userId: string) => api(`/api/v1/deal-rooms/${roomId}/members`, { method: "POST", body: { userId, role } }));

  async function load() {
    setLoadError(null);
    try {
      setPeople(await api<ProfileSummary[]>(`/api/v1/deal-rooms/${roomId}/members`));
    } catch (error) {
      setLoadError(errorMessage(error));
    }
  }
  const shown = (people ?? []).filter((p) => !q || `${p.displayName} ${p.handle}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);

  return (
    <Dialog onOpenChange={(open) => (open ? void load() : setPeople(null))}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <UserPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent title="Invite to this room" description="You can invite your connections. They'll see only the room name and NDA until they accept.">
        <div className="space-y-4">
          {loadError ? <Alert tone="error">{loadError}</Alert> : null}
          {invite.error ? <Alert tone="error">{invite.error}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Input aria-label="Search your connections" placeholder="Search your connections" value={q} onChange={(e) => setQ(e.currentTarget.value)} />
            <Select aria-label="Role" value={role} onChange={(e) => setRole(e.currentTarget.value as typeof role)}>
              {(isOwner ? (["admin", "member", "viewer"] as const) : (["member", "viewer"] as const)).map((r) => (
                <option key={r} value={r}>
                  {DEAL_ROOM_ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          {people === null && !loadError ? <p className="text-sm text-muted">Loading your connections…</p> : null}
          {people && shown.length === 0 ? <p className="text-sm text-muted">No connections left to invite.</p> : null}
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={p.avatarUrl} name={p.displayName} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.displayName}</span>
                  <span className="block truncate text-xs text-muted">{p.headline ?? `@${p.handle}`}</span>
                </span>
                <Button
                  size="sm"
                  disabled={invite.pending}
                  onClick={async () => {
                    if ((await invite.run(p.id)) !== undefined) {
                      toast.show(`Invited ${p.displayName}`);
                      setPeople((list) => (list ?? []).filter((x) => x.id !== p.id));
                      router.refresh();
                    }
                  }}
                >
                  Invite
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MemberControls({ roomId, userId, role, canChangeRole, canRemove }: { roomId: string; userId: string; role: DealRoomRole; canChangeRole: boolean; canRemove: boolean }) {
  const router = useRouter();
  const update = useAction((next: string) => api(`/api/v1/deal-rooms/${roomId}/members/${userId}`, { method: "PATCH", body: { role: next } }));
  const remove = useAction(() => api(`/api/v1/deal-rooms/${roomId}/members/${userId}`, { method: "DELETE" }));
  return (
    <div className="flex items-center gap-2">
      {canChangeRole ? (
        <Select
          aria-label="Role"
          className="h-9 w-auto text-xs"
          defaultValue={role}
          disabled={update.pending}
          onChange={async (e) => {
            if ((await update.run(e.currentTarget.value)) !== undefined) router.refresh();
          }}
        >
          {(["admin", "member", "viewer"] as const).map((r) => (
            <option key={r} value={r}>
              {DEAL_ROOM_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      ) : null}
      {canRemove ? (
        <Button
          variant="ghost"
          size="sm"
          aria-label="Remove from room"
          disabled={remove.pending}
          onClick={async () => {
            if (!window.confirm("Remove this person? Their access ends immediately.")) return;
            if ((await remove.run()) !== undefined) router.refresh();
          }}
        >
          <Trash2 />
        </Button>
      ) : null}
      {update.error || remove.error ? (
        <span role="alert" className="text-xs text-danger">
          {update.error ?? remove.error}
        </span>
      ) : null}
    </div>
  );
}

function putFile(signedUrl: string, file: File, onProgress: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    const key = publicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (key) xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("content-type", file.type);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(0.99, e.loaded / e.total));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiClientError("internal", "Upload failed. Please try again.", xhr.status)));
    xhr.onerror = () => reject(new ApiClientError("internal", "Upload failed. Check your connection and try again.", 0));
    xhr.send(file);
  });
}

/** Uploads straight to Storage with real progress, then registers the document (a new version when the name matches). */
export function DocumentUploader({ roomId }: { roomId: string }) {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; value: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    setError(null);
    for (const file of Array.from(files ?? [])) {
      const check = checkDealRoomFile(file);
      if (!check.ok) {
        setError(`${file.name}: ${check.error}`);
        continue;
      }
      try {
        setProgress({ name: file.name, value: 0 });
        const ticket = await api<{ path: string; signedUrl: string }>(`/api/v1/deal-rooms/${roomId}/documents/upload-url`, {
          method: "POST",
          body: { fileName: file.name, mimeType: file.type, size: file.size },
        });
        await putFile(ticket.signedUrl, file, (value) => setProgress({ name: file.name, value }));
        await api(`/api/v1/deal-rooms/${roomId}/documents`, {
          method: "POST",
          body: { path: ticket.path, fileName: file.name, mimeType: file.type, size: file.size },
        });
        toast.show(`${file.name} shared`);
      } catch (e) {
        setError(`${file.name}: ${errorMessage(e)}`);
      }
    }
    setProgress(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" multiple accept={DEAL_ROOM_ACCEPT} className="sr-only" id="deal-room-upload" onChange={(e) => upload(e.currentTarget.files)} />
      <Button asChild variant="secondary" disabled={progress !== null}>
        <label htmlFor="deal-room-upload" className="cursor-pointer">
          <FileUp /> {progress ? `Uploading ${progress.name} · ${Math.round(progress.value * 100)}%` : "Upload documents"}
        </label>
      </Button>
      <p className="text-xs text-muted">PDF, Word, Excel, PowerPoint or images, up to 50 MB. Uploading a file with the same name adds a new version.</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

export function RemoveDocumentButton({ documentId, name }: { documentId: string; name: string }) {
  const router = useRouter();
  const remove = useAction(() => api(`/api/v1/deal-room-documents/${documentId}`, { method: "DELETE" }));
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={`Remove ${name}`}
      title={remove.error ?? "Remove"}
      disabled={remove.pending}
      onClick={async () => {
        if (!window.confirm(`Remove ${name}? Members will no longer be able to open it. The access history is kept.`)) return;
        if ((await remove.run()) !== undefined) router.refresh();
      }}
    >
      <Trash2 />
    </Button>
  );
}

export function DiscussionForm({ roomId }: { roomId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const post = useAction((text: string) => api(`/api/v1/deal-rooms/${roomId}/messages`, { method: "POST", body: { body: text } }));
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const text = body.trim();
        if (!text) return post.setErrors(zodFieldErrors([{ path: ["body"], message: "Write a message" }]));
        if ((await post.run(text)) !== undefined) {
          setBody("");
          router.refresh();
        }
      }}
    >
      {post.error ? <Alert tone="error">{post.error}</Alert> : null}
      <Field id="deal-room-message" label="Add to the discussion" error={post.fieldErrors.body}>
        {(a) => <Textarea rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.currentTarget.value)} {...a} />}
      </Field>
      <Button type="submit" size="sm" disabled={post.pending}>
        <Send /> {post.pending ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}
