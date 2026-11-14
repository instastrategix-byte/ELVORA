"use client";

import { Menu as MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

export function MobileMenu({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 md:hidden" aria-label="Open menu">
        <MenuIcon className="size-5" />
      </DialogTrigger>
      <DialogContent title="ELVORA">
        <nav aria-label="Mobile" className="flex flex-col">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={pathname === item.href ? "page" : undefined}
              className="border-b border-border py-3.5 text-lg aria-[current=page]:text-accent"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button asChild variant="outline" onClick={() => setOpen(false)}>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <Link href="/apply">Apply</Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
