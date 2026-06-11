"use client";

import * as React from "react";
import Link from "next/link";

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
//   5. authenticated + active    → primary CTA opening the contact modal.

export function ContactSellerButton({
  listingId,
  listingTitle,
  isOwner,
  isAuthenticated,
  listingActive,
  existingThreadId,
  prefill,
}: {
  listingId: number;
  listingTitle: string;
  isOwner: boolean;
  isAuthenticated: boolean;
  listingActive: boolean;
  existingThreadId: number | null;
  prefill: { name: string; email: string; phone?: string } | null;
}) {
  const [open, setOpen] = React.useState(false);

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

  // 5) Authenticated buyer on an active listing → the contact form modal.
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
