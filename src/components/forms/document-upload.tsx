"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/primitives";
import { errorMessage } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload";

type Doc = { key: string; name: string; path?: string; status: "uploading" | "ready" | "failed" };

/** Uploads private documents (PDF/JPEG/PNG) to the verification-documents bucket. */
export function DocumentUpload({ max = 5, onChange }: { max?: number; onChange: (paths: string[], busy: boolean) => void }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function publish(next: Doc[]) {
    setDocs(next);
    onChange(
      next.filter((d) => d.status === "ready" && d.path).map((d) => d.path!),
      next.some((d) => d.status === "uploading"),
    );
  }

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    let current = docs;
    for (const file of Array.from(files).slice(0, max - docs.length)) {
      const key = crypto.randomUUID();
      current = [...current, { key, name: file.name, status: "uploading" }];
      publish(current);
      try {
        const path = await uploadFile(file, "verification_document");
        current = current.map((d) => (d.key === key ? { ...d, path, status: "ready" } : d));
      } catch (e) {
        current = current.map((d) => (d.key === key ? { ...d, status: "failed" } : d));
        setError(errorMessage(e));
      }
      publish(current);
    }
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />
      <Button variant="outline" onClick={() => input.current?.click()} disabled={docs.length >= max}>
        <Upload /> Add documents
      </Button>
      {docs.length ? (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.key} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
              <FileText className="size-4 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              {d.status === "uploading" ? <Spinner label="Uploading" /> : d.status === "failed" ? <span className="text-xs text-danger">Failed</span> : <span className="text-xs text-success">Uploaded</span>}
              <button type="button" onClick={() => publish(docs.filter((x) => x.key !== d.key))} aria-label={`Remove ${d.name}`} className="text-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted">PDF, JPEG or PNG, up to 10 MB each, maximum {max}.</p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
