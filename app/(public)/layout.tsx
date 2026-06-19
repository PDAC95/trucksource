import { SiteHeader } from "@/components/layout/site-header";

// The header is auth-aware (Messages badge for signed-in users — MSG-05's
// "always visible" entry point), so this layout renders per-request.
// Invariant 6: personalized output is never cached across users. The feed and
// listing pages underneath are already force-dynamic for event logging.
export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
