import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { unreadThreadCount } from "@/lib/messaging/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// The global Messages nav entry + unread badge (MSG-05). Server component:
// one non-PII count read per request — the badge updates on navigation, NOT
// via a realtime subscription (locked recommendation; the open-thread view is
// the realtime surface).
//
// MOUNT (research Open Q1): the (app) header is the v1 mount — the public
// feed has no header chrome for authed users, so the badge is visible on
// every authed-app page only. Post-v1: a shared header across (public) too.
export async function MessagesBadge({ userId }: { userId: string }) {
  const count = await unreadThreadCount(userId);

  return (
    <Button asChild variant="ghost" size="sm" className="relative gap-2">
      <Link href="/messages">
        <MessageSquare className="size-4" />
        <span className="hidden sm:inline">Messages</span>
        {count > 0 && (
          <Badge className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">
            {count > 9 ? "9+" : count}
          </Badge>
        )}
      </Link>
    </Button>
  );
}
