import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("panel", className)} {...props} />;
}

const badgeTones = {
  neutral: "border-border text-muted",
  accent: "border-accent/40 text-accent",
  success: "border-success/40 text-success",
  warning: "border-warning/40 text-warning",
  danger: "border-danger/40 text-danger",
} as const;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("shimmer rounded-lg", className)} {...props} />;
}

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center", className)}>
      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

const alertTones = {
  info: { icon: Info, cls: "border-border bg-surface-2 text-fg" },
  success: { icon: CheckCircle2, cls: "border-success/40 bg-success/10 text-fg" },
  warning: { icon: AlertTriangle, cls: "border-warning/40 bg-warning/10 text-fg" },
  error: { icon: XCircle, cls: "border-danger/40 bg-danger/10 text-fg" },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: keyof typeof alertTones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, cls } = alertTones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-muted">{children}</div> : null}
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface/50 px-6 py-16 text-center",
        "bg-[radial-gradient(50%_60%_at_50%_0%,var(--glow),transparent_70%)]",
        className,
      )}
    >
      {icon ? (
        <div className="mb-5 flex size-14 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-accent ring-8 ring-surface-2/40 [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <h3 className="display text-2xl">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Avatar({
  src,
  name,
  size = 40,
  className,
}: {
  src: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-2 text-fg ring-1 ring-border", className)}
      style={{ width: size, height: size }}
    >
      {src ? (
        // User media from Supabase Storage (public bucket); next/image is not used because
        // object URLs are user-controlled and change on re-upload.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="font-display" style={{ fontSize: size * 0.4 }} aria-hidden="true">
          {initials(name)}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1 className="display text-4xl sm:text-5xl">{title}</h1>
        {description ? <p className="max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
