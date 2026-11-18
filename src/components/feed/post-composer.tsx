"use client";

import { ImagePlus, Sparkles, Video, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Alert, Avatar } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload";
import { MAX_ATTACHMENTS, POST_MAX_LENGTH } from "@backend/modules/feed/schemas";
import type { PostView } from "@backend/modules/feed/types";

type Attachment = { key: string; file: File; preview: string; type: "image" | "video"; path?: string; status: "uploading" | "ready" | "failed" };

const REFINE_OPTIONS = [
  { mode: "polish", label: "Polish wording" },
  { mode: "concise", label: "Make it concise" },
  { mode: "professional", label: "More professional" },
  { mode: "warmer", label: "Warmer tone" },
] as const;

export function PostComposer({
  authorName,
  avatarUrl,
  aiEnabled = false,
  onCreated,
}: {
  authorName: string;
  avatarUrl: string | null;
  aiEnabled?: boolean;
  onCreated: (post: PostView) => void;
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<"public" | "members" | "connections">("members");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [refining, setRefining] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function refine(mode: (typeof REFINE_OPTIONS)[number]["mode"]) {
    setRefining(true);
    setError(null);
    try {
      const res = await api<{ text: string }>("/api/v1/ai/refine", { method: "POST", body: { draft: body, mode } });
      setSuggestion(res.text);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRefining(false);
    }
  }

  const uploading = attachments.some((a) => a.status === "uploading");
  const failed = attachments.some((a) => a.status === "failed");
  const canPost = !posting && !uploading && !failed && (body.trim().length > 0 || attachments.length > 0);

  async function addFiles(files: FileList | null, type: "image" | "video") {
    if (!files) return;
    setError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    const picked = Array.from(files).slice(0, room);
    if (files.length > room) setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    for (const file of picked) {
      const key = crypto.randomUUID();
      const att: Attachment = { key, file, preview: URL.createObjectURL(file), type, status: "uploading" };
      setAttachments((prev) => [...prev, att]);
      try {
        const path = await uploadFile(file, type === "image" ? "post_image" : "post_video");
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, path, status: "ready" } : a)));
      } catch (e) {
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, status: "failed" } : a)));
        setError(errorMessage(e));
      }
    }
  }

  function removeAttachment(key: string) {
    setAttachments((prev) => {
      const a = prev.find((x) => x.key === key);
      if (a) URL.revokeObjectURL(a.preview);
      return prev.filter((x) => x.key !== key);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      const post = await api<PostView>("/api/v1/posts", {
        method: "POST",
        body: {
          body: body.trim(),
          visibility,
          attachments: attachments.map((a) => ({ path: a.path, type: a.type })),
        },
      });
      attachments.forEach((a) => URL.revokeObjectURL(a.preview));
      setBody("");
      setAttachments([]);
      onCreated(post);
      toast.show("Posted");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <form id="compose" onSubmit={submit} className="panel scroll-mt-24 p-4 transition-colors focus-within:border-border-strong sm:p-5" aria-label="Create a post">
      <div className="flex gap-3">
        <Avatar src={avatarUrl} name={authorName} size={44} />
        <div className="min-w-0 flex-1">
          <label htmlFor="composer" className="sr-only">
            What would you like to share?
          </label>
          <Textarea
            id="composer"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={POST_MAX_LENGTH}
            placeholder="Share a perspective, an opportunity or a milestone…"
            className="min-h-20 resize-none border-0 bg-transparent px-0 text-base hover:border-0 focus:ring-0"
            aria-describedby="composer-hint"
          />
          <p id="composer-hint" className="flex justify-between gap-3 text-xs text-muted">
            <span>Use #topics and @handles to reach the right people.</span>
            {body.length > POST_MAX_LENGTH * 0.8 ? (
              <span className={body.length >= POST_MAX_LENGTH ? "text-danger" : ""}>
                {body.length}/{POST_MAX_LENGTH}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {attachments.length ? (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {attachments.map((a) => (
            <li key={a.key} className="relative overflow-hidden rounded-xl border border-border">
              {a.type === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL)
                <img src={a.preview} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <video src={a.preview} className="aspect-square w-full bg-black object-cover" muted />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-bg/80 px-2 py-1 text-[11px]">
                {a.status === "uploading" ? "Uploading…" : a.status === "failed" ? "Upload failed" : "Ready"}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(a.key)}
                className="absolute top-1.5 right-1.5 rounded-full bg-bg/80 p-1"
                aria-label="Remove attachment"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestion !== null ? (
        <div className="mt-3 rounded-xl border border-accent/40 bg-surface-2 p-4" aria-live="polite">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-accent">
            <Sparkles className="size-3.5" aria-hidden="true" /> Suggested rewrite — review before posting
          </p>
          <p className="text-[15px] leading-7 whitespace-pre-line">{suggestion}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)}>
              Keep mine
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setBody(suggestion.slice(0, POST_MAX_LENGTH));
                setSuggestion(null);
              }}
            >
              Use this
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => (addFiles(e.target.files, "image"), (e.target.value = ""))} />
        <input ref={videoInput} type="file" accept="video/mp4,video/webm" hidden onChange={(e) => (addFiles(e.target.files, "video"), (e.target.value = ""))} />
        <Button variant="ghost" size="sm" onClick={() => imageInput.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS}>
          <ImagePlus className="text-accent" /> Photo
        </Button>
        <Button variant="ghost" size="sm" onClick={() => videoInput.current?.click()} disabled={attachments.length >= MAX_ATTACHMENTS}>
          <Video className="text-accent" /> Video
        </Button>
        {aiEnabled ? (
          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={refining || body.trim().length < 10} title={body.trim().length < 10 ? "Write a draft first" : undefined}>
                <Sparkles className="text-accent" /> {refining ? "Refining…" : "Refine with AI"}
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              {REFINE_OPTIONS.map((o) => (
                <MenuItem key={o.mode} onSelect={() => refine(o.mode)}>
                  {o.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          <span className="sr-only sm:not-sr-only">Visible to</span>
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)} className="h-9 w-auto text-sm">
            <option value="public">Everyone</option>
            <option value="members">Members</option>
            <option value="connections">Connections</option>
          </Select>
        </label>
        <Button type="submit" size="sm" disabled={!canPost}>
          {posting ? "Posting…" : uploading ? "Uploading…" : "Post"}
        </Button>
      </div>
    </form>
  );
}
