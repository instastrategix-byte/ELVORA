import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";

export function MembershipRequired({ title, body, plan }: { title: string; body: string; plan: string }) {
  return (
    <Card className="space-y-4 p-8 text-center">
      <h2 className="display text-3xl">{title}</h2>
      <p className="mx-auto max-w-lg text-sm text-muted">{body}</p>
      <div className="flex justify-center gap-3">
        <Button asChild>
          <Link href={`/apply?plan=${plan}`}>Apply</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/account/membership">View my membership</Link>
        </Button>
      </div>
    </Card>
  );
}
