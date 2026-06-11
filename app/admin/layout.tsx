import { requireAdmin } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

// Admin console shell (ADMO-01). Per-request gate — never cache one admin's
// shell for anyone else (invariant #6).
export const dynamic = "force-dynamic";

// ANTI-PATTERN GUARD: this layout gate is UX only. Next.js layouts do not
// re-run for every nested navigation and are NOT an authorization boundary.
// Every admin Server Action and admin route handler MUST call requireAdmin()
// itself before touching data.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin(); // non-admin / anon => 404, the console is not advertised

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="shrink-0 border-b bg-card md:w-56 md:border-b-0 md:border-r">
        <div className="md:sticky md:top-0 md:h-svh">
          <AdminSidebar />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
