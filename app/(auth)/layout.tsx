import { Toaster } from "@/components/ui/sonner";

// Shared shell for the auth pages: a centered card column plus the global
// Toaster so server-action errors (rendered via sonner) actually appear.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
      <Toaster />
    </main>
  );
}
