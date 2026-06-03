import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Wrap with withBotId so Vercel BotID can route its protected-path proxying.
// Pairs with instrumentation-client.ts (protect POST /verify) and checkBotId()
// in the sendOtp Server Action.
export default withBotId(nextConfig);
