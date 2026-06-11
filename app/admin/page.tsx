import { Skeleton } from "@/components/ui/skeleton";

// Placeholder Dashboard — plan 10-06 replaces this body with the live
// analytics dashboard. Keep this file minimal so the rewrite is trivial.
export const dynamic = "force-dynamic";

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Analytics dashboard
      </h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
