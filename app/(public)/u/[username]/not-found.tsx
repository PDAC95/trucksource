import Link from "next/link";
import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

// Rendered when notFound() is called for an unknown username — never a crash.

export default function ProfileNotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <UserX className="size-12 text-muted-foreground" aria-hidden />
      <h1 className="text-2xl font-semibold tracking-tight">
        Profile not found
      </h1>
      <p className="text-muted-foreground">
        We couldn&apos;t find a user with that username.
      </p>
      <Button asChild className="mt-2">
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
