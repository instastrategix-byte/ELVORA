import { ShieldCheck } from "lucide-react";
import { AdminNav } from "@/components/admin/admin-nav";

/** Static chrome only — every admin page enforces staff rank itself (and SQL re-checks). */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow flex items-center gap-2">
        <ShieldCheck className="size-3.5" aria-hidden="true" /> Staff only
      </p>
      <h1 className="display mt-2 mb-6 text-4xl">Administration</h1>
      <AdminNav />
      <div className="mt-8">{children}</div>
    </div>
  );
}
