"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ContactFormModal } from "@/components/messaging/contact-form-modal";

// The MSG-01 buyer entry point on the listing page — the ONLY door into chat
// is the contact form behind this CTA (invariant #5; submitContact enforces
// the contact-before-thread order server-side, this component must never
// create another path).
//
// Render states (LOCKED decisions, order matters):
//   1. owner                     → nothing (sellers don't contact themselves).
//   2. existing thread           → "View conversation" link — works even when
//                                  the listing went sold/expired (existing
//                                  threads stay open, MSG-04 posture).
//   3. listing not active        → nothing (new contacts closed; the sold
//                                  badge already tells the story).
//   4. anon                      → primary CTA linking to /login?next=… (the
//                                  SaveButton login-invite posture, but a full
//                                  redirect: contacting is a committed action).
//   4.5 authed + UNVERIFIED       → CTA IDENTICAL in appearance to #5 (gate
//                                  invisible until click, CONTEXT) but a Link to
//                                  /verify?require=phone&next=…?contact=1. The
//                                  early contact gate (VERF-02): nothing to
//                                  preserve, so route before opening any modal.
//   5. authenticated + verified   → primary CTA opening the contact modal.

export function ContactSellerButton({
  listingId,
  listingTitle,
  isOwner,
  isAuthenticated,
  listingActive,
  existingThreadId,
  prefill,
  isPhoneVerified,
}: {
  listingId: number;
  listingTitle: string;
  isOwner: boolean;
  isAuthenticated: boolean;
  listingActive: boolean;
  existingThreadId: number | null;
  prefill: { name: string; email: string; phone?: string } | null;
  isPhoneVerified: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // AUTO-OPEN on return from /verify (RESEARCH Q6, Pattern 4): when the buyer
  // comes back to …?contact=1 now phone-verified, the modal should open with zero
  // extra clicks. We compute the trigger ONCE from the first-render search params
  // and seed `open` with it (no setState-in-effect — the cascading-render lint
  // rule). The guards mean it never fires for owners, sold/expired listings, an
  // existing thread, or a still-unverified viewer.
  const shouldAutoOpen = React.useMemo(
    () =>
      searchParams.get("contact") === "1" &&
      isPhoneVerified &&
      !isOwner &&
      listingActive &&
      existingThreadId === null,
    // Read first-render params only — the effect below strips the param, so we
    // must not recompute on that navigation (Pitfall 4).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [open, setOpen] = React.useState(shouldAutoOpen);

  // The side-effects of the auto-open (a brief English confirmation toast + URL
  // cleanup) run once, AFTER mount — stripping ?contact=1 via router.replace so a
  // plain refresh doesn't re-open the modal (Pitfall 4). Hooks run
  // unconditionally, so this sits BEFORE every early return below.
  React.useEffect(() => {
    if (shouldAutoOpen) {
      toast("Phone verified — you're all set");
      router.replace(pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 1) The seller never contacts themself.
  if (isOwner) return null;

  // 2) Re-contact resolves to the existing thread — secondary prominence, and
  //    it stays available after the listing goes sold/expired.
  if (existingThreadId !== null) {
    return (
      <Button asChild variant="secondary" className="mt-2 w-fit">
        <Link href={`/messages/${existingThreadId}`}>View conversation</Link>
      </Button>
    );
  }

  // 3) No NEW contacts on sold/expired listings — for anyone.
  if (!listingActive) return null;

  // 4) Anon → login, then back to this listing (?next= round-trip).
  if (!isAuthenticated) {
    return (
      <Button asChild className="mt-2 w-fit">
        <Link href={`/login?next=/listings/${listingId}`}>
          Contact Seller About This Part
        </Link>
      </Button>
    );
  }

  // 4.5) Authenticated but phone-UNVERIFIED → an EARLY gate. The button is
  //      visually identical to #5 (same Button, same text — the gate is
  //      invisible until click, CONTEXT) but it's a Link to /verify, carrying a
  //      next= back to this listing with ?contact=1 so the modal auto-opens on
  //      return. The server not_verified gate (Plan 17-01) remains the authority;
  //      this just spares the buyer a dead-end modal.
  if (!isPhoneVerified) {
    const next = encodeURIComponent(`/listings/${listingId}?contact=1`);
    return (
      <Button asChild className="mt-2 w-fit">
        <Link href={`/verify?require=phone&next=${next}`}>
          Contact Seller About This Part
        </Link>
      </Button>
    );
  }

  // 5) Authenticated, phone-verified buyer on an active listing → the contact
  //    form modal.
  return (
    <>
      <Button
        type="button"
        className="mt-2 w-fit"
        onClick={() => setOpen(true)}
      >
        Contact Seller About This Part
      </Button>
      <ContactFormModal
        listingId={listingId}
        listingTitle={listingTitle}
        prefill={prefill}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
