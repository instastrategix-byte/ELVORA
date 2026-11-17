"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end" }: { children: ReactNode; align?: "start" | "end" }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={8}
        className="z-50 min-w-52 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)] data-[state=open]:animate-scale-in"
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none select-none text-fg/90 data-[highlighted]:bg-surface-2 data-[highlighted]:text-fg data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
