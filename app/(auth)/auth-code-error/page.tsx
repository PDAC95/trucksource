import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Link invalid · OG Truck Parts",
};

export default function AuthCodeErrorPage() {
  return (
    <div className="grid gap-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlertIcon className="size-6 text-destructive" />
      </div>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          This link is invalid or expired
        </h1>
        <p className="text-muted-foreground text-sm">
          Confirmation and reset links expire after a while. Request a fresh one
          and try again.
        </p>
      </div>
      <div className="grid gap-2">
        <Link href="/login" className="text-primary text-sm underline">
          Back to log in
        </Link>
        <Link
          href="/check-email"
          className="text-muted-foreground text-sm underline"
        >
          Resend confirmation email
        </Link>
      </div>
    </div>
  );
}
