import type { MetadataRoute } from "next";

// Typed web manifest (Next file convention auto-injects <link rel="manifest">).
// Navy theme/background match the --background token (#0d111b) so add-to-home
// and standalone chrome stay on-brand. The hex literals here are Next metadata
// config values, not styled classNames — an allowed token-discipline exception
// (same as viewport.themeColor in app/layout.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OG Truck Parts",
    short_name: "OG Truck Parts",
    description: "Real Parts. Real Sellers.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d111b",
    theme_color: "#0d111b",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
