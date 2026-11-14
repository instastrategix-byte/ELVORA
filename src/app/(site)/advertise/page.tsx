import { BarChart3, CheckCircle2, Eye, Megaphone, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Reach a verified audience of decision-makers with reviewed, clearly labelled sponsored placements.",
};

const FEATURES = [
  { icon: Target, title: "Respectful targeting", body: "Target by member location and declared interests only. No third-party tracking." },
  { icon: CheckCircle2, title: "Reviewed campaigns", body: "Every campaign is reviewed before delivery to protect member experience and brand safety." },
  { icon: BarChart3, title: "Measured reporting", body: "Reports show measured impressions and clicks only — never modelled or estimated figures." },
  { icon: Eye, title: "Transparent placement", body: "Sponsored content is always labelled as sponsored, in the feed, marketplace and discovery." },
];

export default function AdvertisePage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-end">
        <div className="space-y-5">
          <p className="eyebrow">Advertising</p>
          <h1 className="display text-5xl sm:text-6xl">Be seen by the people who matter.</h1>
          <p className="max-w-xl text-lg text-muted">
            Sponsored placements for luxury brands and verified businesses, delivered with budgets, schedules and frequency limits enforced on our
            servers.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/apply?plan=advertiser">Apply as an advertiser</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/ads">Advertiser dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-border bg-surface p-6">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Megaphone className="size-3.5" aria-hidden="true" /> Sponsored
          </p>
          <p className="display mt-3 text-2xl">Your campaign headline</p>
          <p className="mt-2 text-sm text-muted">A short, considered message that appears alongside member content — always labelled.</p>
          <p className="mt-4 text-xs text-muted">Example placement preview</p>
        </div>
      </div>
      <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-2xl border border-border bg-surface p-6">
            <f.icon className="size-5 text-accent" aria-hidden="true" />
            <h2 className="mt-3 font-medium">{f.title}</h2>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>
      <div className="mt-20 rounded-3xl border border-border p-8 sm:p-10">
        <h2 className="display text-3xl">How it works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-4">
          {["Apply for an Advertiser membership", "Create a campaign with budget and schedule", "Our team reviews it", "Track measured results"].map((s, i) => (
            <li key={s} className="space-y-2">
              <span className="display text-3xl text-accent">0{i + 1}</span>
              <p className="text-sm">{s}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
