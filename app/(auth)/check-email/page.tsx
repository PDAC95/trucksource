import type { Metadata } from "next";
import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { ResendConfirmation } from "@/components/auth/resend-confirmation";

export const metadata: Metadata = {
  title: "Check your email · Take-Off Parts",
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="grid gap-6 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10">
        <MailCheckIcon className="size-6 text-primary" />
      </div>
      <div className="grid gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="text-muted-foreground text-sm">
          We sent a confirmation link{email ? ` to ${email}` : ""}. Click it to
          activate your account — you won&apos;t be able to sign in until you
          do.
        </p>
      </div>

      <ResendConfirmation email={email} />

      <p className="text-muted-foreground text-sm">
        Already confirmed?{" "}
        <Link href="/login" className="text-primary underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
