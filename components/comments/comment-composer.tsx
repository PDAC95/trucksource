"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { z } from "zod";

import {
  commentSchema,
  COMMENT_MAX_LENGTH,
  type CommentInput,
} from "@/lib/comments/schema";
import { addComment, deleteComment } from "@/lib/actions/comments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// The comment write surface (SOCL-01) — client siblings of the server-rendered
// CommentSection. THE trust rule: this form is UX-only validation; the SAME
// commentSchema re-validates inside the addComment Server Action (repo
// invariant — single client+server source of truth). RLS in 0015_social.sql is
// the real enforcement (self-attribution, active-listing, depth-1).
//
// Attribution stays username-only end to end: nothing in this file ever sees a
// real name, email, or phone — the thread reader resolves authors exclusively
// from profiles_public.

// RHF working type — the schema's INPUT side (mirrors ListingFormValues).
type CommentFormValues = z.input<typeof commentSchema>;

// When fewer than this many characters remain, surface the live counter.
const REMAINING_HINT_THRESHOLD = 100;

function commentErrorMessage(
  error:
    | "unauthenticated"
    | "invalid"
    | "rate_limited"
    | "comments_closed"
    | "not_found",
): string {
  switch (error) {
    case "rate_limited":
      return "You're going too fast — wait a moment";
    case "comments_closed":
      return "Comments are closed";
    case "unauthenticated":
      return "Sign in to comment";
    case "not_found":
      return "This listing no longer exists";
    default:
      return "Couldn't post the comment";
  }
}

/**
 * The comment form. Top-level on the listing page (no parentId) and inline
 * under a parent comment in reply mode (parentId set — depth-1; the section
 * only offers Reply on top-level comments).
 *
 * Anon viewers get a login invite instead of a textarea — posting requires an
 * account, reading never does.
 */
export function CommentComposer({
  listingId,
  parentId,
  isAuthenticated,
  onDone,
}: {
  listingId: number;
  parentId?: number;
  isAuthenticated: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();

  const form = useForm<CommentFormValues, unknown, CommentInput>({
    resolver: zodResolver(commentSchema),
    defaultValues: {
      listingId,
      parentId: parentId ?? null,
      body: "",
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="bg-muted/50 text-muted-foreground rounded-lg border p-4 text-sm">
        <Link
          href="/login"
          className="text-primary font-medium underline-offset-2 hover:underline"
        >
          Sign in
        </Link>{" "}
        to comment.
      </div>
    );
  }

  const body = form.watch("body") ?? "";
  const remaining = COMMENT_MAX_LENGTH - body.length;
  const bodyError = form.formState.errors.body;

  async function onSubmit(values: CommentInput) {
    const res = await addComment(values);
    if (!res.ok) {
      toast.error(commentErrorMessage(res.error));
      return;
    }
    form.reset({ listingId, parentId: parentId ?? null, body: "" });
    // addComment already revalidates /listings/[id]; refresh re-renders the RSC
    // thread so the new comment appears without a manual reload.
    router.refresh();
    onDone?.();
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="grid gap-2"
      aria-label={parentId ? "Reply to comment" : "Write a comment"}
    >
      <Textarea
        {...form.register("body")}
        maxLength={COMMENT_MAX_LENGTH}
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Write a reply…" : "Ask about this part…"}
        aria-invalid={bodyError ? true : undefined}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          {bodyError
            ? "Write a comment of 1 to 1000 characters."
            : remaining <= REMAINING_HINT_THRESHOLD
              ? `${remaining} characters left`
              : null}
        </p>
        <div className="flex items-center gap-2">
          {parentId != null && onDone && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDone}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting
              ? "Posting…"
              : parentId
                ? "Reply"
                : "Comment"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * Per-comment delete control (author OR the listing's seller — the SERVER
 * decides via the RLS delete policy; this component only shows the affordance
 * the section already gated). AlertDialog confirmation; parents warn that
 * replies cascade (FK + audit trigger in the DB).
 */
export function CommentDeleteButton({
  commentId,
  isParent,
}: {
  commentId: number;
  isParent: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await deleteComment(commentId);
      if (!res.ok) {
        toast.error("Couldn't delete the comment");
        return;
      }
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label="Delete comment"
          disabled={pending}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete comment?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone.
            {isParent && " Its replies will be deleted too."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * "Reply" affordance — TOP-LEVEL comments only (depth-1 is the locked
 * structure; replies never offer it). Reveals an inline CommentComposer bound
 * to the parent; posting or cancelling collapses it.
 */
export function CommentReplyToggle({
  listingId,
  parentId,
  isAuthenticated,
}: {
  listingId: number;
  parentId: number;
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-muted-foreground h-7 px-2 text-xs"
        onClick={() => setOpen(true)}
      >
        Reply
      </Button>
    );
  }

  return (
    <div className="mt-2">
      <CommentComposer
        listingId={listingId}
        parentId={parentId}
        isAuthenticated={isAuthenticated}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
