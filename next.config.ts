import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

// Whitelist the Supabase Storage host for next/image so listing photos render
// from the public bucket URL (05-RESEARCH Pattern 4). The hostname is DERIVED
// from NEXT_PUBLIC_SUPABASE_URL so it works across Staging/Prod without
// hardcoding the project ref. Plan-agnostic: this is the plain public-object URL,
// no Image Transformations dependency (Open Q2). If the env var is absent at
// build time we fall back to a wildcard *.supabase.co so the build never breaks.
function supabaseStorageHostname(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      // fall through to the wildcard below
    }
  }
  return "*.supabase.co";
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseStorageHostname(),
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Server Actions default to a 1MB request body — far below the 10MB-per-photo
  // cap enforced server-side in lib/images/strip.ts (MAX_BYTES). uploadListingPhoto
  // streams one raw photo per call, and the RSC/FormData encoding inflates the
  // payload, so we lift the limit to 12mb (10MB photo + encoding overhead).
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

// Wrap with withBotId so Vercel BotID can route its protected-path proxying.
// Pairs with instrumentation-client.ts (protect POST /verify) and checkBotId()
// in the sendOtp Server Action.
export default withBotId(nextConfig);
