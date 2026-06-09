"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  SELLER_TYPES,
  SELLER_TYPE_LABELS,
  type SellerType,
} from "@/lib/seller/badge";
import {
  updateSellerType,
  type UpdateSellerTypeResult,
} from "@/lib/actions/account";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

// ACCT-07: the seller-type control on /account. Single-select of the 7 fixed types
// plus an explicit "No badge / Anonymous" option that maps to null (empty = no badge).
// On change, run updateSellerType inside startTransition, toast, and router.refresh()
// so the force-dynamic page re-reads the saved value. Mirrors contact-preference-form's
// controlled-value discipline. Radix Select can't carry a null/empty value, so the
// "no badge" choice serializes through the NONE sentinel.

const NONE = "__none__";

function actionErrorMessage(
  error: Extract<UpdateSellerTypeResult, { ok: false }>["error"],
): string {
  switch (error) {
    case "unauthenticated":
      return "Your session expired — please log in again.";
    case "not_found":
      return "We couldn't find your account. Refresh and try again.";
    case "invalid":
    default:
      return "Something went wrong. Please try again.";
  }
}

export function SellerTypeForm({ current }: { current: SellerType | null }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [value, setValue] = React.useState<string>(current ?? NONE);

  function onValueChange(next: string) {
    setValue(next);
    const sellerType: SellerType | null =
      next === NONE ? null : (next as SellerType);
    setPending(true);
    React.startTransition(async () => {
      const result = await updateSellerType({ sellerType });
      if (result.ok) {
        toast.success(
          sellerType === null
            ? "Seller type cleared"
            : `Seller type set to ${SELLER_TYPE_LABELS[sellerType]}`,
        );
        router.refresh();
      } else {
        toast.error(actionErrorMessage(result.error));
        setValue(current ?? NONE); // revert the control on failure
      }
      setPending(false);
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor="seller-type">Seller type</Label>
        <p className="text-muted-foreground text-sm">
          An optional, informational label shown on your public profile. It
          changes nothing about your account.
        </p>
      </div>
      <Select value={value} onValueChange={onValueChange} disabled={pending}>
        <SelectTrigger id="seller-type" className="w-full sm:w-80">
          <SelectValue placeholder="No badge / Anonymous" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No badge / Anonymous</SelectItem>
          {SELLER_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {SELLER_TYPE_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
