import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  );
}
