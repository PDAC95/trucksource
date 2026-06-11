"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { MESSAGE_MAX_LENGTH } from "@/lib/messaging/schema";
import type { MessageRow } from "@/lib/messaging/queries";
import { markThreadRead, sendMessage } from "@/lib/actions/messages";
import { ReportMenu } from "@/components/messaging/report-menu";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// The realtime chat surface (MSG-05/06): server-fetched initial messages +
// a postgres_changes INSERT subscription + an optimistic composer.
//
// PRIVACY (MSG-06): sender identity renders ONLY from the `names` map (auth
// UUID → public name, resolved server-side from profiles_public). The realtime
// payload carries id/thread_id/sender_id/body/created_at — zero PII by
// construction.
//
// FUTURE-PROOFING (locked): the channel topic `thread:{id}` is the FUTURE
// Broadcast topic — do not change it. The move to broadcast_changes is
// additive (research Pattern 4); clients already render from full rows.
//
// LOCKED: no typing indicators, no read receipts.

// Temp ids for optimistic rows: negative so they can never collide with the
// DB's bigint identity (always positive).
let tempIdCounter = -1;

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const deltaMs = Date.now() - date.getTime();
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function ThreadView({
  threadId,
  viewerId,
  initialMessages,
  names,
  sendDisabled,
}: {
  threadId: number;
  viewerId: string;
  initialMessages: MessageRow[];
  names: Record<string, string>;
  sendDisabled?: { reason: string };
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<MessageRow[]>(initialMessages);
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // De-duped append: the optimistic insert and the realtime echo of the same
  // message both arrive — the id wins (server rows replace nothing; dupes drop).
  const appendMessage = React.useCallback((incoming: MessageRow) => {
    setMessages((prev) =>
      prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
    );
  }, []);

  // Realtime subscription (research Pattern 4). RLS is the delivery boundary
  // (the messages SELECT policy gates per-subscriber delivery); the filter is
  // a convenience, NOT security. Cleanup via removeChannel (Pitfall 7).
  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      // CRITICAL: push the user's JWT onto the realtime socket BEFORE
      // subscribing. Without this the channel joins as `anon` and the
      // messages SELECT policy silently denies delivery (UAT bug: messages
      // only appeared after a manual reload).
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(`thread:${threadId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `thread_id=eq.${threadId}`,
          },
          (payload) => {
            const incoming = payload.new as MessageRow;
            appendMessage(incoming);
            // Keep the unread badge + email throttle honest: a message that
            // arrives while the thread is OPEN is read (best-effort).
            if (incoming.sender_id !== viewerId) {
              void markThreadRead(threadId);
            }
          },
        )
        .subscribe((status) => {
          // Messages persist — a full refresh re-fetches and heals any gap.
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            router.refresh();
          }
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [threadId, viewerId, appendMessage, router]);

  // Auto-scroll to the newest message.
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function submit() {
    const trimmed = body.trim();
    if (trimmed.length === 0 || sending || sendDisabled) return;

    // Optimistic append with a temp (negative) id; the server row replaces it.
    const tempId = tempIdCounter--;
    const optimistic: MessageRow = {
      id: tempId,
      thread_id: threadId,
      sender_id: viewerId,
      body: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setBody("");
    setSending(true);

    const res = await sendMessage({ threadId, body: trimmed });
    setSending(false);

    if (res.ok) {
      // Replace temp with the persisted row — unless the realtime echo
      // already delivered it (then just drop the temp).
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === res.message.id)
          ? withoutTemp
          : [...withoutTemp, res.message];
      });
      return;
    }

    // Roll back the optimistic row + restore the draft.
    setMessages((prev) => prev.filter((m) => m.id !== tempId));
    setBody(trimmed);
    switch (res.error) {
      case "rate_limited":
        toast.error("You're sending messages too fast. Wait a minute.");
        break;
      case "blocked_or_invalid":
        toast.error("You can't message this user.");
        break;
      case "unauthenticated":
        router.push("/login");
        break;
      default:
        toast.error("Something went wrong. Try again.");
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {messages.map((m) => {
          const own = m.sender_id === viewerId;
          return (
            <li
              key={m.id}
              className={`group flex w-full ${own ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex max-w-[80%] items-start gap-1 ${own ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`rounded-lg px-3 py-2 ${
                    own
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  <div
                    className={`mb-0.5 flex items-baseline gap-2 text-xs ${
                      own
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="font-medium">
                      {names[m.sender_id] ?? "Member"}
                    </span>
                    <span suppressHydrationWarning>
                      {formatTimestamp(m.created_at)}
                    </span>
                  </div>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {m.body}
                  </p>
                </div>
                {/* Report (MSG-07) on every received message — never your own.
                    Optimistic temp rows are always own, so id is a real DB id. */}
                {!own && (
                  <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <ReportMenu
                      targetType="message"
                      targetId={m.id}
                      isAuthenticated
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
        <div ref={bottomRef} />
      </ul>

      {sendDisabled ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-3 text-center text-sm">
          {sendDisabled.reason}
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="grid gap-2"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={2}
            placeholder="Write a message…"
            aria-label="Message"
          />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs">
              {body.length}/{MESSAGE_MAX_LENGTH}
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={sending || body.trim().length === 0}
            >
              <SendHorizontal className="size-4" />
              {sending ? "Sending…" : "Send"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
