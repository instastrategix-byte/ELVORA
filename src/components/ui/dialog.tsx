"use client";

import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  size = "md",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  size?: "md" | "lg";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-3xl border border-border bg-surface p-6 pt-3 shadow-[var(--shadow-lift)] data-[state=open]:animate-sheet-up",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-full sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:pt-6 sm:data-[state=open]:animate-scale-in",
          size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
          className,
        )}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <D.Title className="display text-2xl">{title}</D.Title>
            {description ? <D.Description className="text-sm text-muted">{description}</D.Description> : null}
          </div>
          <D.Close className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-5" />
          </D.Close>
        </div>
        {children}
      </D.Content>
    </D.Portal>
  );
}
