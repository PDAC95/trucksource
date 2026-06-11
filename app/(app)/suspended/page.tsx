import { redirect } from "next/navigation";

import { getOwnRestriction } from "@/lib/account/restrictions";
import { SuspendedScreen } from "@/components/account/suspended-screen";

// Canonical blocked page (ADMO-01). The (app) layout already swaps children
// for SuspendedScreen whenever the viewer is restricted — this route exists
// as the linkable/canonical address; unrestricted visitors bounce home.
export const dynamic = "force-dynamic";

export default async function SuspendedPage() {
  const restriction = await getOwnRestriction();
  if (!restriction) redirect("/");
  return <SuspendedScreen restriction={restriction} />;
}
